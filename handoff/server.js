require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { DateTime } = require('luxon');
const { computeSlots, searchWindow } = require('./lib/slots');
const { createCalendar } = require('./lib/calendar');
const { Store } = require('./lib/store');
const { EMAIL_RE, companyFromEmail } = require('./lib/email');
const { checkOnce, startWatcher } = require('./lib/watcher');

const TEAM_FILE = process.env.TEAM_FILE || (fs.existsSync(path.join(__dirname, 'team.json')) ? 'team.json' : 'team.example.json');
const team = JSON.parse(fs.readFileSync(path.resolve(__dirname, TEAM_FILE), 'utf8'));
const settings = team.settings;
const calendar = createCalendar();
const store = new Store(path.resolve(__dirname, process.env.DATA_FILE || 'data/watches.json'));

const aeBy = (email) => team.aes.find((a) => a.email === email);
const sdrBy = (email) => team.sdrs.find((s) => s.email === email);
async function openSlots(ae) {
  const { timeMin, timeMax } = searchWindow(settings);
  return computeSlots(ae, settings, await calendar.getBusy(ae.email, timeMin, timeMax));
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

const app = express();
app.use(express.json());

// Keep this page internal. SDR_ACCESS_KEY adds a shared password; for a real
// rollout, put the app behind Google sign-in instead.
app.use((req, res, next) => {
  const key = process.env.SDR_ACCESS_KEY;
  if (!key) return next();
  const [scheme, b64] = (req.headers.authorization || '').split(' ');
  const pass = scheme === 'Basic' && b64 ? Buffer.from(b64, 'base64').toString().split(':').slice(1).join(':') : '';
  if (pass.length === key.length && crypto.timingSafeEqual(Buffer.from(pass), Buffer.from(key))) return next();
  res.set('WWW-Authenticate', 'Basic realm="Demo booking"').status(401).send('Sign in required');
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/team', (req, res) => {
  res.json({
    aes: team.aes.map(({ name, email, schedulerLink }) => ({ name, email, hasLink: Boolean(schedulerLink) })),
    sdrs: team.sdrs,
    mock: calendar.name === 'mock',
  });
});

// The AE's open demo times.
app.get('/api/slots', async (req, res, next) => {
  try {
    const ae = aeBy(String(req.query.ae || ''));
    if (!ae) throw httpError(400, 'Pick an AE.');
    res.json({ slots: await openSlots(ae) });
  } catch (e) {
    next(e);
  }
});

// One click: put the demo on the AE's calendar and invite the SDR + prospect.
const inFlight = new Set(); // stops a double-click from double-booking
app.post('/api/book', async (req, res, next) => {
  const ae = aeBy(String(req.body.aeEmail || ''));
  const sdr = sdrBy(String(req.body.sdrEmail || ''));
  const prospectEmail = String(req.body.prospectEmail || '').trim().toLowerCase();
  const start = DateTime.fromISO(String(req.body.start || ''), { zone: 'utc' });
  const lockKey = `${ae?.email}|${start.toISO()}`;
  try {
    if (!sdr) throw httpError(400, 'Pick who you are.');
    if (!ae) throw httpError(400, 'Pick an AE.');
    if (!EMAIL_RE.test(prospectEmail)) throw httpError(400, "That doesn't look like an email address.");
    if (!start.isValid) throw httpError(400, 'Pick a time.');
    if (inFlight.has(lockKey)) throw httpError(409, 'Already booking this time.');
    inFlight.add(lockKey);

    const startIso = start.toISO({ suppressMilliseconds: true });
    // Re-check live: the AE's calendar may have changed since the page loaded.
    if (!(await openSlots(ae)).includes(startIso)) throw httpError(409, `${ae.name} is no longer free then. Pick another time.`);

    const company = companyFromEmail(prospectEmail);
    const event = await calendar.createEvent({
      organizerEmail: ae.email,
      start: startIso,
      end: start.plus({ minutes: settings.meetingMinutes }).toISO({ suppressMilliseconds: true }),
      summary: `${company ? company + ' <> ' : ''}${settings.companyName} | Demo`,
      description: `Intro demo of ${settings.companyName} with ${ae.name}.\n\nQuestions before the call? Reply to ${sdr.name} (${sdr.email}).`,
      attendees: [
        { email: ae.email, name: ae.name },
        { email: sdr.email, name: sdr.name },
        { email: prospectEmail },
      ],
      location: ae.meetingLink,
    });
    res.json({ ok: true, start: startIso, meetLink: event.meetLink, htmlLink: event.htmlLink });
  } catch (e) {
    next(e);
  } finally {
    inFlight.delete(lockKey);
  }
});

// Prospect wants a link: hand back the AE's own scheduling link (e.g. Zoom
// Scheduler) and watch the AE's calendar so the SDR gets added when they book.
app.post('/api/watch', (req, res, next) => {
  try {
    const ae = aeBy(String(req.body.aeEmail || ''));
    const sdr = sdrBy(String(req.body.sdrEmail || ''));
    const prospectEmail = String(req.body.prospectEmail || '').trim().toLowerCase();
    if (!sdr) throw httpError(400, 'Pick who you are.');
    if (!ae || !ae.schedulerLink) throw httpError(400, 'This AE has no scheduling link set up.');
    if (!EMAIL_RE.test(prospectEmail)) throw httpError(400, "Add the prospect's email first, so you get added when they book.");
    const existing = store.watches().find((w) => w.status === 'waiting' && w.sdrEmail === sdr.email && w.aeEmail === ae.email && w.prospectEmail === prospectEmail);
    if (!existing) store.add({ sdrEmail: sdr.email, aeEmail: ae.email, prospectEmail, status: 'waiting', createdAt: new Date().toISOString() });
    res.json({ link: ae.schedulerLink });
  } catch (e) {
    next(e);
  }
});

// The SDR's recent "links sent" and whether each prospect has booked.
app.get('/api/watches', (req, res) => {
  const sdrEmail = String(req.query.sdr || '');
  const list = store
    .watches()
    .filter((w) => w.sdrEmail === sdrEmail)
    .slice(-15)
    .reverse()
    .map((w) => ({ prospectEmail: w.prospectEmail, aeName: aeBy(w.aeEmail)?.name || w.aeEmail, status: w.status, start: w.start || null, createdAt: w.createdAt }));
  res.json({ watches: list });
});

// Demo mode only: pretend the prospect booked through the AE's link.
if (calendar.name === 'mock') {
  app.post('/api/demo/simulate-booking', async (req, res, next) => {
    try {
      const w = store.watches().find((x) => x.status === 'waiting' && x.prospectEmail === String(req.body.prospectEmail || '') && x.sdrEmail === String(req.body.sdrEmail || ''));
      if (!w) throw httpError(404, 'Nothing waiting for that prospect.');
      const ae = aeBy(w.aeEmail);
      const [startIso] = await openSlots(ae);
      await calendar.createEvent({
        organizerEmail: ae.email,
        start: startIso,
        end: DateTime.fromISO(startIso).plus({ minutes: settings.meetingMinutes }).toISO(),
        summary: `Intro call (booked via scheduling link)`,
        attendees: [{ email: ae.email, name: ae.name }, { email: w.prospectEmail }],
      });
      await checkOnce({ calendar, store, team });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
}

app.use((err, req, res, next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong. Please try again.' });
});

if (require.main === module) {
  const port = process.env.PORT || 3100;
  startWatcher({ calendar, store, team }, Number(process.env.WATCH_INTERVAL_SECONDS) || 60);
  app.listen(port, () => console.log(`Demo booking running at http://localhost:${port} (calendar: ${calendar.name}, team: ${TEAM_FILE})`));
}

module.exports = { app };

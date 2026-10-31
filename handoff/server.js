require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { DateTime } = require('luxon');
const { computeSlots, pickSuggestions, searchWindow } = require('./lib/slots');
const { createCalendar } = require('./lib/calendar');
const { Store } = require('./lib/store');

const TEAM_FILE = process.env.TEAM_FILE || (fs.existsSync(path.join(__dirname, 'team.json')) ? 'team.json' : 'team.example.json');
const team = JSON.parse(fs.readFileSync(path.resolve(__dirname, TEAM_FILE), 'utf8'));
const settings = team.settings;
const calendar = createCalendar();
const store = new Store(path.resolve(__dirname, process.env.DATA_FILE || 'data/handoffs.json'));
const BASE_URL = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3100}`).replace(/\/$/, '');

const aeBy = (email) => team.aes.find((a) => a.email === email);
const sdrBy = (email) => team.sdrs.find((s) => s.email === email);
const EMAIL_RE = /^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/;
const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com']);

function companyFromEmail(email) {
  const domain = email.split('@')[1].toLowerCase();
  if (FREE_MAIL.has(domain)) return null;
  const root = domain.split('.').slice(-2)[0];
  return root.charAt(0).toUpperCase() + root.slice(1);
}

async function openSlots(handoff) {
  const ae = aeBy(handoff.aeEmail);
  const { timeMin, timeMax } = searchWindow(settings);
  let busy = await calendar.getBusy(ae.email, timeMin, timeMax);
  if (settings.requireSdrFree) busy = busy.concat(await calendar.getBusy(handoff.sdrEmail, timeMin, timeMax));
  return computeSlots(ae, settings, busy);
}

// One booking at a time per handoff, so a double-click can't double-book.
const locks = new Set();

async function book(handoff, start, { name, extraGuests = [], bookedBy }) {
  if (handoff.status === 'booked') throw httpError(409, 'This meeting is already booked.');
  if (locks.has(handoff.token)) throw httpError(409, 'Booking already in progress.');
  locks.add(handoff.token);
  try {
    const startDt = DateTime.fromISO(start, { zone: 'utc' });
    if (!startDt.isValid) throw httpError(400, 'Invalid time.');
    const startIso = startDt.toISO({ suppressMilliseconds: true });
    // Re-check live availability — the AE's calendar may have changed since the link was sent.
    const slots = await openSlots(handoff);
    if (!slots.includes(startIso)) throw httpError(409, 'That time was just taken. Please pick another.');

    const ae = aeBy(handoff.aeEmail);
    const sdr = sdrBy(handoff.sdrEmail);
    const prospectName = (name || handoff.prospectName || '').trim();
    const company = handoff.company;
    const endIso = startDt.plus({ minutes: settings.meetingMinutes }).toISO({ suppressMilliseconds: true });

    const attendees = [
      { email: ae.email, name: ae.name },
      { email: sdr.email, name: sdr.name },
      { email: handoff.prospectEmail, name: prospectName || undefined },
      ...extraGuests.map((email) => ({ email })),
    ];
    const event = await calendar.createEvent({
      organizerEmail: ae.email,
      start: startIso,
      end: endIso,
      summary: `${company || prospectName || 'Intro'} <> ${settings.companyName} | Demo`,
      description: `Intro demo of ${settings.companyName} with ${ae.name}.\n\nQuestions before the call? Just reply to ${sdr.name} (${sdr.email}).`,
      attendees,
      location: ae.meetingLink,
    });

    handoff.status = 'booked';
    handoff.booking = { start: startIso, end: endIso, eventId: event.id, meetLink: event.meetLink, bookedBy, bookedAt: new Date().toISOString(), prospectName, extraGuests };
    store.save(handoff);
    notifySlack(handoff, ae, sdr).catch((e) => console.error('Slack notify failed:', e.message));
    return handoff;
  } finally {
    locks.delete(handoff.token);
  }
}

async function notifySlack(h, ae, sdr) {
  if (!process.env.SLACK_WEBHOOK_URL) return;
  const when = DateTime.fromISO(h.booking.start).setZone(ae.timezone).toFormat("ccc LLL d 'at' h:mm a ZZZZ");
  const who = h.booking.prospectName || h.prospectEmail;
  const text = `:calendar: Demo booked: *${who}*${h.company ? ` (${h.company})` : ''} with ${ae.name}, ${when}. Sourced by ${sdr.name}${h.booking.bookedBy === 'prospect' ? ' — prospect self-booked' : ''}.`;
  await fetch(process.env.SLACK_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

// ---------- app ----------
const app = express();
app.use(express.json());

// Internal (SDR) pages are protected with a shared password when SDR_ACCESS_KEY is set.
// For a real rollout, put the app behind Google SSO instead (e.g. Cloud Run + IAP).
function requireSdr(req, res, next) {
  const key = process.env.SDR_ACCESS_KEY;
  if (!key) return next();
  const [scheme, b64] = (req.headers.authorization || '').split(' ');
  const pass = scheme === 'Basic' && b64 ? Buffer.from(b64, 'base64').toString().split(':').slice(1).join(':') : '';
  const ok = pass.length === key.length && crypto.timingSafeEqual(Buffer.from(pass), Buffer.from(key));
  if (ok) return next();
  res.set('WWW-Authenticate', 'Basic realm="Demo handoff"').status(401).send('Sign in required');
}

const pub = path.join(__dirname, 'public');
app.get('/', requireSdr, (req, res) => res.sendFile(path.join(pub, 'sdr.html')));
app.get('/b/:token', (req, res) => res.sendFile(path.join(pub, 'book.html')));
app.use('/assets', express.static(pub));

app.get('/api/team', requireSdr, (req, res) => {
  res.json({
    aes: team.aes.map(({ name, email, timezone }) => ({ name, email, timezone })),
    sdrs: team.sdrs,
    meetingMinutes: settings.meetingMinutes,
    mock: calendar.name === 'mock',
  });
});

// SDR: paste a prospect email -> get a link + 3 suggested times.
app.post('/api/handoffs', requireSdr, async (req, res, next) => {
  try {
    const sdrEmail = String(req.body.sdrEmail || '');
    const aeEmail = String(req.body.aeEmail || '');
    const prospectEmail = String(req.body.prospectEmail || '').trim().toLowerCase();
    if (!sdrBy(sdrEmail)) throw httpError(400, 'Pick who you are.');
    if (!aeBy(aeEmail)) throw httpError(400, 'Pick an AE.');
    if (!EMAIL_RE.test(prospectEmail)) throw httpError(400, "That doesn't look like an email address.");

    let handoff = store.findPending({ sdrEmail, aeEmail, prospectEmail });
    const reused = Boolean(handoff);
    if (!handoff) {
      handoff = store.save({
        token: crypto.randomBytes(12).toString('base64url'),
        sdrEmail,
        aeEmail,
        prospectEmail,
        prospectName: String(req.body.prospectName || '').trim() || null,
        company: companyFromEmail(prospectEmail),
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
    }
    const slots = await openSlots(handoff);
    res.json({
      token: handoff.token,
      url: `${BASE_URL}/b/${handoff.token}`,
      reused,
      suggestions: pickSuggestions(slots, aeBy(aeEmail)),
      slots,
    });
  } catch (e) {
    next(e);
  }
});

// SDR: prospect replied with a time -> book it in one click.
app.post('/api/handoffs/:token/book', requireSdr, async (req, res, next) => {
  try {
    const h = store.get(req.params.token);
    if (!h) throw httpError(404, 'Not found.');
    await book(h, String(req.body.start || ''), { bookedBy: 'sdr' });
    res.json({ ok: true, booking: h.booking });
  } catch (e) {
    next(e);
  }
});

// Prospect: public booking page data. Only exposes free slots, never calendar details.
app.get('/api/public/:token', async (req, res, next) => {
  try {
    const h = store.get(req.params.token);
    if (!h) throw httpError(404, 'This link is invalid or has expired.');
    const ae = aeBy(h.aeEmail);
    const sdr = sdrBy(h.sdrEmail);
    const base = { status: h.status, aeName: ae.name, sdrName: sdr.name, prospectName: h.prospectName, prospectEmail: h.prospectEmail, companyName: settings.companyName, meetingMinutes: settings.meetingMinutes };
    if (h.status === 'booked') return res.json({ ...base, booking: { start: h.booking.start, end: h.booking.end, meetLink: h.booking.meetLink } });
    res.json({ ...base, slots: await openSlots(h) });
  } catch (e) {
    next(e);
  }
});

app.post('/api/public/:token/book', async (req, res, next) => {
  try {
    const h = store.get(req.params.token);
    if (!h) throw httpError(404, 'This link is invalid or has expired.');
    const extraGuests = String(req.body.guests || '')
      .split(/[\s,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (extraGuests.length > 5 || extraGuests.some((g) => !EMAIL_RE.test(g))) throw httpError(400, 'Please check the extra guest emails.');
    await book(h, String(req.body.start || ''), { name: String(req.body.name || '').slice(0, 100), extraGuests, bookedBy: 'prospect' });
    res.json({ ok: true, booking: { start: h.booking.start, end: h.booking.end, meetLink: h.booking.meetLink } });
  } catch (e) {
    next(e);
  }
});

app.use((err, req, res, next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong. Please try again.' });
});

if (require.main === module) {
  const port = process.env.PORT || 3100;
  app.listen(port, () => console.log(`Demo handoff running at ${BASE_URL} (calendar: ${calendar.name}, team: ${TEAM_FILE})`));
}

module.exports = { app };

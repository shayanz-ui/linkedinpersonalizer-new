// When an SDR sends a prospect the AE's own scheduling link (e.g. Zoom Scheduler),
// the booking lands on the AE's Google Calendar without the SDR. This watches the
// AE's calendar for that prospect's booking and adds the SDR to the invite.
const { businessDomain } = require('./email');

const DAY = 24 * 60 * 60 * 1000;

function matches(watch, attendeeEmails) {
  if (attendeeEmails.includes(watch.prospectEmail)) return true;
  // Same company counts too (e.g. a cofounder booked instead).
  const domain = businessDomain(watch.prospectEmail);
  return Boolean(domain) && attendeeEmails.some((e) => e.endsWith('@' + domain));
}

async function checkOnce({ calendar, store, team, now = new Date(), maxAgeDays = 14 }) {
  const waiting = store.watches().filter((w) => w.status === 'waiting');
  for (const w of waiting) {
    if (now - new Date(w.createdAt) > maxAgeDays * DAY) w.status = 'expired';
  }

  const byAe = new Map();
  for (const w of waiting.filter((x) => x.status === 'waiting')) {
    if (!byAe.has(w.aeEmail)) byAe.set(w.aeEmail, []);
    byAe.get(w.aeEmail).push(w);
  }

  for (const [aeEmail, watches] of byAe) {
    const since = watches.map((w) => w.createdAt).sort()[0];
    let events;
    try {
      events = await calendar.listEvents(aeEmail, since);
    } catch (e) {
      console.error(`Watcher: can't read ${aeEmail}'s calendar:`, e.message);
      continue;
    }
    for (const ev of events) {
      if (ev.status === 'cancelled') continue;
      const emails = ev.attendees.map((a) => a.email);
      for (const w of watches) {
        if (w.status !== 'waiting' || ev.created < w.createdAt || !matches(w, emails)) continue;
        const sdr = team.sdrs.find((s) => s.email === w.sdrEmail);
        try {
          await calendar.addAttendee(aeEmail, ev.id, { email: sdr.email, name: sdr.name });
          Object.assign(w, { status: 'booked', start: ev.start, eventId: ev.id, bookedAt: now.toISOString() });
        } catch (e) {
          Object.assign(w, { status: 'error', start: ev.start, error: e.message });
          console.error(`Watcher: couldn't add ${sdr.email} to event ${ev.id}:`, e.message);
        }
      }
    }
  }
  store.save();
}

function startWatcher(opts, intervalSeconds = 60) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await checkOnce(opts);
    } catch (e) {
      console.error('Watcher error:', e);
    } finally {
      running = false;
    }
  };
  setInterval(tick, intervalSeconds * 1000).unref();
  return tick;
}

module.exports = { checkOnce, startWatcher };

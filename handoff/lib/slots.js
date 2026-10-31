// Turns an AE's working hours + busy blocks into bookable 30-min slots.
const { DateTime } = require('luxon');

function hm(str) {
  const [h, m] = str.split(':').map(Number);
  return { hour: h, minute: m || 0 };
}

// The window we need busy data for. Calendar days, padded for weekends.
function searchWindow(settings, now = DateTime.utc()) {
  const days = Math.ceil((settings.daysAhead * 7) / 5) + 3;
  return { timeMin: now.toUTC().toISO(), timeMax: now.plus({ days }).toUTC().toISO() };
}

/**
 * @param {object} ae        { timezone, workingHours: {start,end}, workingDays? }
 * @param {object} settings  { meetingMinutes, slotStepMinutes, daysAhead, minNoticeHours, bufferMinutes }
 * @param {Array}  busy      [{ start, end }] ISO strings
 * @returns {string[]} slot start times as UTC ISO strings, ascending
 */
function computeSlots(ae, settings, busy, now = DateTime.utc()) {
  const tz = ae.timezone;
  const dur = settings.meetingMinutes * 60000;
  const step = settings.slotStepMinutes || settings.meetingMinutes;
  const buf = (settings.bufferMinutes || 0) * 60000;
  const workingDays = ae.workingDays || [1, 2, 3, 4, 5]; // Mon-Fri
  const earliest = now.plus({ hours: settings.minNoticeHours }).toMillis();

  const blocks = busy.map((b) => ({
    s: DateTime.fromISO(b.start).toMillis() - buf,
    e: DateTime.fromISO(b.end).toMillis() + buf,
  }));

  const slots = [];
  let day = now.setZone(tz).startOf('day');
  let counted = 0;
  while (counted < settings.daysAhead) {
    if (workingDays.includes(day.weekday)) {
      counted++;
      let t = day.set(hm(ae.workingHours.start));
      const end = day.set(hm(ae.workingHours.end)).toMillis();
      while (t.toMillis() + dur <= end) {
        const s = t.toMillis();
        const e = s + dur;
        if (s >= earliest && !blocks.some((b) => b.s < e && b.e > s)) {
          slots.push(t.toUTC().toISO({ suppressMilliseconds: true }));
        }
        t = t.plus({ minutes: step });
      }
    }
    day = day.plus({ days: 1 });
  }
  return slots;
}

/**
 * Pick 3 times to offer in an email: on different days, at varied times
 * (late morning / early afternoon / mid-morning in the AE's timezone).
 */
function pickSuggestions(slots, ae, count = 3) {
  const targets = [11, 14, 10, 15];
  const byDay = new Map();
  for (const iso of slots) {
    const local = DateTime.fromISO(iso, { zone: ae.timezone });
    const key = local.toISODate();
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push({ iso, hour: local.hour + local.minute / 60 });
  }
  const picks = [];
  for (const daySlots of byDay.values()) {
    if (picks.length >= count) break;
    const target = targets[picks.length % targets.length];
    daySlots.sort((a, b) => Math.abs(a.hour - target) - Math.abs(b.hour - target));
    picks.push(daySlots[0].iso);
  }
  return picks;
}

module.exports = { computeSlots, pickSuggestions, searchWindow };

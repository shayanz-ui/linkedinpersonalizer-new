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

module.exports = { computeSlots, searchWindow };

const test = require('node:test');
const assert = require('node:assert');
const { DateTime } = require('luxon');
const { computeSlots } = require('../lib/slots');

const ae = { timezone: 'America/New_York', workingHours: { start: '09:00', end: '17:00' } };
const settings = { meetingMinutes: 30, slotStepMinutes: 30, daysAhead: 2, minNoticeHours: 4, bufferMinutes: 0 };
// Friday Oct 30 2026, 8am ET
const now = DateTime.fromISO('2026-10-30T08:00:00', { zone: 'America/New_York' }).toUTC();

test('respects working hours, weekends, min notice', () => {
  const slots = computeSlots(ae, settings, [], now);
  const local = slots.map((s) => DateTime.fromISO(s).setZone(ae.timezone));
  assert.ok(local.every((d) => d.weekday <= 5), 'no weekend slots');
  assert.ok(local.every((d) => d.hour >= 9 && d.plus({ minutes: 30 }) <= d.set({ hour: 17, minute: 0 })));
  // Friday: noon onwards (4h notice) => 12:00..16:30 = 10 slots; Monday: 16 slots
  assert.strictEqual(slots.length, 10 + 16);
  assert.strictEqual(local[0].toFormat('ccc HH:mm'), 'Fri 12:00');
  assert.strictEqual(local[10].toFormat('ccc HH:mm'), 'Mon 09:00');
});

test('removes busy times and handles DST (Nov 2 2026 is after fall back)', () => {
  const busy = [{ start: '2026-11-02T14:00:00Z', end: '2026-11-02T15:00:00Z' }]; // 9-10am EST
  const slots = computeSlots(ae, settings, busy, now);
  assert.ok(!slots.includes('2026-11-02T14:00:00Z'));
  assert.ok(!slots.includes('2026-11-02T14:30:00Z'));
  assert.ok(slots.includes('2026-11-02T15:00:00Z'));
});

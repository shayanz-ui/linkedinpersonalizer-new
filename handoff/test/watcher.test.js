const test = require('node:test');
const assert = require('node:assert');
const { checkOnce } = require('../lib/watcher');
const { Store } = require('../lib/store');

const team = { sdrs: [{ name: 'Sam', email: 'sam@mercury.com' }] };
const sent = '2026-11-01T10:00:00.000Z';

function fakeCalendar(events) {
  const added = [];
  return {
    added,
    async listEvents() { return events; },
    async addAttendee(ae, id, a) { added.push({ ae, id, email: a.email }); },
  };
}
function storeWith(prospectEmail) {
  const store = new Store(null);
  store.add({ sdrEmail: 'sam@mercury.com', aeEmail: 'ethan@mercury.com', prospectEmail, status: 'waiting', createdAt: sent });
  return store;
}
const now = new Date('2026-11-02T10:00:00Z');

test('adds the SDR when the prospect books through the AE link', async () => {
  const cal = fakeCalendar([{ id: 'e1', status: 'confirmed', created: '2026-11-01T12:00:00Z', start: '2026-11-03T15:00:00Z', attendees: [{ email: 'ethan@mercury.com' }, { email: 'jane@acme.com' }] }]);
  const store = storeWith('jane@acme.com');
  await checkOnce({ calendar: cal, store, team, now });
  assert.deepStrictEqual(cal.added, [{ ae: 'ethan@mercury.com', id: 'e1', email: 'sam@mercury.com' }]);
  assert.strictEqual(store.watches()[0].status, 'booked');
});

test('matches a colleague at the same company, but not gmail strangers', async () => {
  const cal = fakeCalendar([
    { id: 'e1', status: 'confirmed', created: '2026-11-01T12:00:00Z', start: 'x', attendees: [{ email: 'cofounder@acme.com' }] },
  ]);
  const store = storeWith('jane@acme.com');
  await checkOnce({ calendar: cal, store, team, now });
  assert.strictEqual(cal.added.length, 1);

  const cal2 = fakeCalendar([{ id: 'e2', status: 'confirmed', created: '2026-11-01T12:00:00Z', start: 'x', attendees: [{ email: 'someone@gmail.com' }] }]);
  const store2 = storeWith('raj@gmail.com');
  await checkOnce({ calendar: cal2, store: store2, team, now });
  assert.strictEqual(cal2.added.length, 0);
  assert.strictEqual(store2.watches()[0].status, 'waiting');
});

test('ignores bookings made before the link was sent, and cancelled ones', async () => {
  const cal = fakeCalendar([
    { id: 'old', status: 'confirmed', created: '2026-10-30T12:00:00Z', start: 'x', attendees: [{ email: 'jane@acme.com' }] },
    { id: 'gone', status: 'cancelled', created: '2026-11-01T12:00:00Z', start: 'x', attendees: [{ email: 'jane@acme.com' }] },
  ]);
  const store = storeWith('jane@acme.com');
  await checkOnce({ calendar: cal, store, team, now });
  assert.strictEqual(cal.added.length, 0);
});

test('expires after 14 days', async () => {
  const store = storeWith('jane@acme.com');
  await checkOnce({ calendar: fakeCalendar([]), store, team, now: new Date('2026-11-20T00:00:00Z') });
  assert.strictEqual(store.watches()[0].status, 'expired');
});

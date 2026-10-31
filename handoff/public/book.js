const $ = (id) => document.getElementById(id);
const token = location.pathname.split('/').pop();
const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
const ZONES = [...new Set([detected, 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'Europe/London'])];
let data, day, chosen;

const fmt = (iso, opts) => new Intl.DateTimeFormat('en-US', { timeZone: $('tz').value, ...opts }).format(new Date(iso));
const dayKey = (iso) => fmt(iso, { year: 'numeric', month: '2-digit', day: '2-digit' });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const zoneName = (z) => z.replace(/_/g, ' ').split('/').pop();

function groupByDay() {
  const map = new Map();
  for (const iso of data.slots) {
    const k = dayKey(iso);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(iso);
  }
  return map;
}

function render() {
  const days = groupByDay();
  if (!days.size) {
    $('days').innerHTML = '';
    $('times').innerHTML = '<p class="muted">No open times right now. Just reply to your email and we\'ll find one.</p>';
    return;
  }
  if (!days.has(day)) day = days.keys().next().value;
  $('days').innerHTML = [...days.entries()]
    .map(([k, slots]) => `<button type="button" class="day" data-day="${k}" aria-pressed="${k === day}">${fmt(slots[0], { weekday: 'short' })}<small>${fmt(slots[0], { month: 'short', day: 'numeric' })}</small></button>`)
    .join('');
  $('times').innerHTML = days
    .get(day)
    .map((iso) => `<button type="button" class="time" data-start="${iso}" aria-pressed="${iso === chosen}">${fmt(iso, { hour: 'numeric', minute: '2-digit' })}</button>`)
    .join('');
}

function choose(iso) {
  chosen = iso;
  render();
  $('chosen').textContent = `${fmt(iso, { weekday: 'long', month: 'long', day: 'numeric' })} at ${fmt(iso, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`;
  $('confirm').classList.remove('hidden');
  $('error').textContent = '';
  $('confirm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showDone(booking) {
  $('picker').classList.add('hidden');
  $('done').classList.remove('hidden');
  $('doneText').textContent = `A calendar invite is on its way to ${data.prospectEmail}.`;
  $('doneWhen').textContent = `${fmt(booking.start, { weekday: 'long', month: 'long', day: 'numeric' })}, ${fmt(booking.start, { hour: 'numeric', minute: '2-digit' })} – ${fmt(booking.end, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`;
  $('donePeople').innerHTML = [data.aeName, data.sdrName, 'You'].map((n) => `<span class="pill">${esc(n)}</span>`).join('');
  $('doneLink').textContent = booking.meetLink ? `Join link: ${booking.meetLink}` : '';
}

async function init() {
  $('tz').innerHTML = ZONES.map((z) => `<option value="${z}">${esc(zoneName(z))}</option>`).join('');
  const res = await fetch(`/api/public/${encodeURIComponent(token)}`);
  data = await res.json();
  $('loading').classList.add('hidden');
  if (!res.ok) {
    $('fatal').textContent = data.error || 'Something went wrong.';
    $('fatal').classList.remove('hidden');
    return;
  }
  document.title = `Book a demo with ${data.aeName}`;
  if (data.status === 'booked') return showDone(data.booking);

  $('title').textContent = `Book your ${data.companyName} demo`;
  $('subtitle').textContent = `${data.meetingMinutes} minutes with ${data.aeName}. ${data.sdrName} will join too.`;
  $('name').value = data.prospectName || '';
  $('inviteTo').textContent = `The invite goes to ${data.prospectEmail}, ${data.aeName} and ${data.sdrName}.`;
  $('picker').classList.remove('hidden');
  render();

  $('tz').addEventListener('change', () => { day = null; render(); if (chosen) choose(chosen); });
  $('days').addEventListener('click', (e) => {
    const b = e.target.closest('[data-day]');
    if (b) { day = b.dataset.day; render(); }
  });
  $('times').addEventListener('click', (e) => {
    const b = e.target.closest('[data-start]');
    if (b) choose(b.dataset.start);
  });
  $('confirm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('bookBtn').disabled = true;
    $('bookBtn').textContent = 'Booking…';
    $('error').textContent = '';
    try {
      const r = await fetch(`/api/public/${encodeURIComponent(token)}/book`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ start: chosen, name: $('name').value, guests: $('guests').value }),
      });
      const out = await r.json();
      if (!r.ok) {
        if (r.status === 409) {
          // Slot got taken: refresh availability.
          const fresh = await (await fetch(`/api/public/${encodeURIComponent(token)}`)).json();
          if (fresh.status === 'booked') { data = fresh; return showDone(fresh.booking); }
          data.slots = fresh.slots || [];
          chosen = null;
          render();
        }
        throw new Error(out.error || 'Could not book that time.');
      }
      showDone(out.booking);
    } catch (err) {
      $('error').textContent = err.message;
    } finally {
      $('bookBtn').disabled = false;
      $('bookBtn').textContent = 'Confirm';
    }
  });
}

init().catch(() => {
  $('loading').classList.add('hidden');
  $('fatal').textContent = 'Something went wrong loading this page.';
  $('fatal').classList.remove('hidden');
});

const $ = (id) => document.getElementById(id);
const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
const ZONES = [
  ['America/New_York', 'Eastern'],
  ['America/Chicago', 'Central'],
  ['America/Denver', 'Mountain'],
  ['America/Phoenix', 'Arizona'],
  ['America/Los_Angeles', 'Pacific'],
  ['Europe/London', 'London'],
];
const mem = {
  get: (k) => { try { return localStorage.getItem('demo.' + k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem('demo.' + k, v); } catch {} },
};
let slots = [];
let day = null;
let chosen = null;

const fmt = (iso, opts) => new Intl.DateTimeFormat('en-US', { timeZone: $('tz').value, ...opts }).format(new Date(iso));
const dayKey = (iso) => fmt(iso, { year: 'numeric', month: '2-digit', day: '2-digit' });
const longLabel = (iso) => `${fmt(iso, { weekday: 'short', month: 'short', day: 'numeric' })} at ${fmt(iso, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`;

function fill(select, items, saved) {
  select.innerHTML = items.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  if (saved && items.some(([v]) => v === saved)) select.value = saved;
}

async function api(url, body) {
  const res = await fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function render() {
  const days = new Map();
  for (const iso of slots) {
    const k = dayKey(iso);
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(iso);
  }
  if (!days.size) {
    $('days').innerHTML = '';
    $('times').innerHTML = '<p class="muted">No open times in the next two weeks.</p>';
    return;
  }
  if (!days.has(day)) day = days.keys().next().value;
  $('days').innerHTML = [...days.entries()]
    .map(([k, s]) => `<button type="button" class="day" data-day="${k}" aria-pressed="${k === day}">${fmt(s[0], { weekday: 'short' })}<small>${fmt(s[0], { month: 'short', day: 'numeric' })}</small></button>`)
    .join('');
  $('times').innerHTML = days
    .get(day)
    .map((iso) => `<button type="button" class="time" data-start="${iso}" aria-pressed="${iso === chosen}">${fmt(iso, { hour: 'numeric', minute: '2-digit' })}</button>`)
    .join('');
  $('book').disabled = !chosen;
  $('book').textContent = chosen ? `Book ${longLabel(chosen)}` : 'Pick a time';
}

async function loadSlots() {
  chosen = null;
  $('times').innerHTML = '<p class="muted">Loading…</p>';
  $('days').innerHTML = '';
  try {
    slots = (await api(`/api/slots?ae=${encodeURIComponent($('ae').value)}`)).slots;
    render();
  } catch (e) {
    $('times').innerHTML = '';
    $('error').textContent = e.message;
  }
}

async function init() {
  const team = await api('/api/team');
  if (team.mock) $('mockBanner').classList.remove('hidden');
  fill($('sdr'), team.sdrs.map((s) => [s.email, s.name]), mem.get('sdr'));
  fill($('ae'), team.aes.map((a) => [a.email, a.name]), mem.get('ae'));
  const zones = ZONES.some(([z]) => z === local) ? ZONES : [[local, local.split('/').pop().replace(/_/g, ' ')], ...ZONES];
  fill($('tz'), zones, mem.get('tz') || local);

  $('sdr').addEventListener('change', () => mem.set('sdr', $('sdr').value));
  $('ae').addEventListener('change', () => { mem.set('ae', $('ae').value); loadSlots(); });
  $('tz').addEventListener('change', () => { mem.set('tz', $('tz').value); day = null; render(); });
  $('days').addEventListener('click', (e) => {
    const b = e.target.closest('[data-day]');
    if (b) { day = b.dataset.day; render(); }
  });
  $('times').addEventListener('click', (e) => {
    const b = e.target.closest('[data-start]');
    if (b) { chosen = b.dataset.start; render(); }
  });

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!chosen) return;
    $('error').textContent = '';
    $('done').classList.add('hidden');
    $('book').disabled = true;
    $('book').textContent = 'Booking…';
    try {
      const prospect = $('email').value.trim();
      const out = await api('/api/book', { sdrEmail: $('sdr').value, aeEmail: $('ae').value, prospectEmail: prospect, start: chosen });
      $('done').textContent = `Booked ${longLabel(out.start)}. Invite sent to ${prospect}, ${$('ae').selectedOptions[0].text} and you.`;
      $('done').classList.remove('hidden');
      $('email').value = '';
      await loadSlots();
      $('email').focus();
    } catch (err) {
      $('error').textContent = err.message;
      if (/no longer free/.test(err.message)) await loadSlots();
      else render();
    }
  });

  await loadSlots();
}

init().catch((e) => ($('error').textContent = e.message));

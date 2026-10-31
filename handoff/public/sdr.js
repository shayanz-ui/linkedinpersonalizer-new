const $ = (id) => document.getElementById(id);
const TIMEZONES = [
  ['America/New_York', 'Eastern'],
  ['America/Chicago', 'Central'],
  ['America/Denver', 'Mountain'],
  ['America/Phoenix', 'Arizona'],
  ['America/Los_Angeles', 'Pacific'],
  ['Europe/London', 'London'],
];
const mem = {
  get: (k) => { try { return localStorage.getItem('handoff.' + k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem('handoff.' + k, v); } catch {} },
};
let team, current;

function fmt(iso, tz, opts) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }).format(new Date(iso));
}
function label(iso, tz) {
  const day = fmt(iso, tz, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = fmt(iso, tz, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  return `${day} at ${time}`;
}
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

async function copy(text, note) {
  try {
    await navigator.clipboard.writeText(text);
    $('copied').textContent = note;
    setTimeout(() => ($('copied').textContent = ''), 2500);
  } catch {
    $('copied').textContent = '';
  }
}

function buildMessage({ name, ae, tz, suggestions, url }) {
  const aeFirst = ae.name.split(' ')[0];
  const lines = suggestions.map((iso) => `• ${label(iso, tz)}`).join('\n');
  return (
    `Hi ${name || 'there'},\n\n` +
    `I'd love to get you 30 minutes with ${aeFirst}, who'll walk you through a demo. Do any of these work?\n\n` +
    `${lines}\n\n` +
    `If none of those work, pick any time here: ${url}\n\n` +
    `I'll be on the invite too.`
  );
}

function renderBooking() {
  const tz = $('tz').value;
  $('suggested').innerHTML = current.suggestions
    .map((iso) => `<div class="slot-row"><span>${label(iso, tz)}</span><button type="button" data-start="${iso}">Book</button></div>`)
    .join('');
  fill($('other'), current.slots.map((iso) => [iso, label(iso, tz)]));
}

async function doBook(start, btn) {
  $('bookError').textContent = '';
  btn.disabled = true;
  try {
    const { booking } = await api(`/api/handoffs/${current.token}/book`, { start });
    $('bookCard').classList.add('hidden');
    $('booked').classList.remove('hidden');
    $('booked').textContent = `Booked ${label(booking.start, $('tz').value)}. Invites sent to the AE, the prospect and you.`;
  } catch (e) {
    $('bookError').textContent = e.message;
    btn.disabled = false;
  }
}

async function init() {
  team = await api('/api/team');
  if (team.mock) $('mockBanner').classList.remove('hidden');
  fill($('sdr'), team.sdrs.map((s) => [s.email, s.name]), mem.get('sdr'));
  fill($('ae'), team.aes.map((a) => [a.email, a.name]), mem.get('ae'));
  fill($('tz'), TIMEZONES.map(([v, n]) => [v, n]), mem.get('tz') || 'America/New_York');
  for (const id of ['sdr', 'ae', 'tz']) $(id).addEventListener('change', () => mem.set(id, $(id).value));

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('formError').textContent = '';
    $('go').disabled = true;
    $('go').textContent = 'Checking calendar…';
    try {
      const ae = team.aes.find((a) => a.email === $('ae').value);
      current = await api('/api/handoffs', {
        sdrEmail: $('sdr').value,
        aeEmail: ae.email,
        prospectEmail: $('email').value,
        prospectName: $('name').value,
      });
      if (!current.slots.length) throw new Error(`${ae.name} has no open times in the next two weeks.`);
      $('message').value = buildMessage({ name: $('name').value.trim(), ae, tz: $('tz').value, suggestions: current.suggestions, url: current.url });
      renderBooking();
      $('bookCard').classList.remove('hidden');
      $('booked').classList.add('hidden');
      $('result').classList.remove('hidden');
      copy($('message').value, current.reused ? 'Copied (same link as before for this prospect)' : 'Copied to clipboard');
    } catch (err) {
      $('formError').textContent = err.message;
    } finally {
      $('go').disabled = false;
      $('go').textContent = 'Create handoff';
    }
  });

  $('copyMsg').addEventListener('click', () => copy($('message').value, 'Copied'));
  $('copyLink').addEventListener('click', () => copy(current.url, 'Link copied'));
  $('suggested').addEventListener('click', (e) => {
    if (e.target.dataset.start) doBook(e.target.dataset.start, e.target);
  });
  $('bookOther').addEventListener('click', (e) => doBook($('other').value, e.target));
}

init().catch((e) => ($('formError').textContent = e.message));

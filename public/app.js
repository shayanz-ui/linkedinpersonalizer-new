'use strict';

const $profile = document.getElementById('profile');
const $btn = document.getElementById('generate');
const $results = document.getElementById('results');
const $read = document.getElementById('read');
const $error = document.getElementById('error');

function showError(msg) {
  $error.textContent = msg;
  $error.hidden = false;
}

function clearOutput() {
  $error.hidden = true;
  $results.innerHTML = '';
  $read.hidden = true;
  $read.innerHTML = '';
}

function charCount(s) {
  return `${s.length} chars`;
}

function renderOptions(data) {
  if (data.career_stage || data.signal) {
    const parts = [];
    if (data.career_stage) parts.push(`<strong>Read:</strong> ${escapeHtml(data.career_stage)}`);
    if (data.signal) parts.push(`<strong>Signal:</strong> ${escapeHtml(data.signal)}`);
    $read.innerHTML = parts.join(' &nbsp;·&nbsp; ');
    $read.hidden = false;
  }

  data.options.forEach((msg, i) => {
    const card = document.createElement('div');
    card.className = 'option';

    const head = document.createElement('div');
    head.className = 'option-head';
    head.innerHTML = `<span class="option-tag">Option ${i + 1}</span>`;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(msg).then(() => {
        copyBtn.textContent = 'Copied';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
          copyBtn.classList.remove('copied');
        }, 1500);
      });
    });
    head.appendChild(copyBtn);

    const p = document.createElement('p');
    p.className = 'option-msg';
    p.textContent = msg;

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = charCount(msg);

    card.appendChild(head);
    card.appendChild(p);
    card.appendChild(meta);
    $results.appendChild(card);
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function generate() {
  const profile = $profile.value.trim();
  clearOutput();
  if (!profile) {
    showError('Paste a LinkedIn profile first.');
    return;
  }

  $btn.disabled = true;
  $btn.textContent = 'Thinking…';
  try {
    const resp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      showError(data.error || 'Something went wrong.');
      return;
    }
    renderOptions(data);
  } catch (e) {
    showError('Network error. Please try again.');
  } finally {
    $btn.disabled = false;
    $btn.textContent = 'Generate 2 options';
  }
}

$btn.addEventListener('click', generate);
$profile.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') generate();
});

import * as store from './store.js';
import { searchAnime, getAiring } from './anilist.js';
import { HER_NAME } from './config.js';

const STATUSES = [
  ['watching', 'Watching'],
  ['planning', 'Plan to watch'],
  ['completed', 'Completed'],
  ['paused', 'On hold'],
  ['dropped', 'Dropped'],
];
const STATUS_LABEL = Object.fromEntries(STATUSES);
const FORMAT_LABEL = { TV: 'TV', TV_SHORT: 'Short', MOVIE: 'Movie', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music' };
const SUGGESTIONS = ['Frieren', 'Link Click', 'Mo Dao Zu Shi', 'Spy x Family'];
const MOCHI = `<svg class="mochi" viewBox="0 0 120 100" aria-hidden="true">
  <path d="M24 44 L30 12 L52 32 Z M96 44 L90 12 L68 32 Z" class="m-body"/>
  <ellipse cx="60" cy="62" rx="48" ry="34" class="m-body"/>
  <circle cx="44" cy="60" r="4.5" class="m-ink"/><circle cx="76" cy="60" r="4.5" class="m-ink"/>
  <ellipse cx="34" cy="70" rx="7" ry="4" class="m-blush"/><ellipse cx="86" cy="70" rx="7" ry="4" class="m-blush"/>
  <path d="M54 68 q3 4 6 0 q3 4 6 0" class="m-mouth"/>
</svg>`;

const ui = { view: 'list', status: 'watching', kind: 'all', sort: 'updated' };
try { Object.assign(ui, JSON.parse(localStorage.getItem('cc.ui')), { kind: 'all' }); } catch {}
let openId = null;
let airing = {};
let airingLoaded = false;
let lastResults = [];

const $ = (s, el = document) => el.querySelector(s);
const main = $('#main');
const searchDlg = $('#searchDlg');
const detailDlg = $('#detailDlg');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// The Anime/Donghua filter isn't remembered, so a forgotten filter never hides half her shelf.
const saveUi = () => { try { localStorage.setItem('cc.ui', JSON.stringify({ ...ui, kind: 'all' })); } catch {} };

const isDonghua = (e) => e.country === 'CN';
const tintOf = (e) => (/^#[0-9a-f]{6}$/i.test(e.cover_color || '') ? e.cover_color : '#ff8fb8');
const totalOf = (e) => e.total_eps || airing[e.anilist_id]?.episodes || null;
const nextOf = (e) => {
  const n = airing[e.anilist_id]?.next;
  return n && n.airingAt * 1000 > Date.now() ? n : null;
};

function countdown(airingAt) {
  const ms = airingAt * 1000 - Date.now();
  if (ms <= 0) return 'now';
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d) return `${d}d ${h % 24}h`;
  if (h) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

function badges(e) {
  const kind = isDonghua(e) ? '<span class="badge b-dh">Donghua</span>' : '<span class="badge b-an">Anime</span>';
  const fmt = [FORMAT_LABEL[e.format] || e.format, e.year].filter(Boolean).join(' · ');
  return kind + (fmt ? `<span class="dim">${esc(fmt)}</span>` : '');
}

/* ---------- list view ---------- */

function card(e) {
  const total = totalOf(e);
  const pct = total ? Math.min(100, (e.progress / total) * 100) : e.progress ? 100 : 0;
  const next = nextOf(e);
  return `<article class="card" style="--tint:${tintOf(e)}">
    <button class="cover-btn" data-open="${e.id}" aria-label="Open ${esc(e.title)}">
      <img class="sticker" src="${esc(e.cover_url)}" alt="" loading="lazy">
    </button>
    <div class="card-body">
      <button class="title" data-open="${e.id}">${esc(e.title)}</button>
      <div class="meta">${badges(e)}${e.score ? `<span class="score">♥ ${e.score}</span>` : ''}</div>
      <div class="prog">
        <div class="bar${total ? '' : ' unknown'}"><i style="width:${pct}%"></i></div>
        <span>ep ${e.progress} / ${total ?? '?'}</span>
      </div>
      ${next ? `<p class="next">✦ ep ${next.episode} in <b data-cd="${next.airingAt}">${countdown(next.airingAt)}</b></p>` : ''}
    </div>
    ${e.status !== 'completed' ? `<button class="plus1" data-plus="${e.id}" aria-label="Watched an episode of ${esc(e.title)}">+1</button>` : ''}
  </article>`;
}

const EMPTY = {
  watching: ['Nothing on the go right now.', 'Find something cozy to start'],
  planning: ['Your plan-to-watch shelf is empty.', 'Browse for something new'],
  completed: ['Finished shows collect here like little trophies.', null],
  paused: ['Nothing on hold.', null],
  dropped: ['Nothing dropped. Every show still has a chance.', null],
};

function emptyState() {
  const fresh = !store.all().length;
  const [msg, cta] = fresh
    ? ['Welcome to your cozy corner ✿ Search any anime or donghua to start your shelf.', 'Add your first show']
    : EMPTY[ui.status];
  return `<div class="empty">${MOCHI}<p>${msg}</p>${cta ? `<button class="pill" data-action="search">${cta}</button>` : ''}</div>`;
}

function renderList() {
  const list = store.all();
  const count = (k) => list.filter((e) => e.status === k).length;
  let items = list.filter((e) => e.status === ui.status);
  if (ui.kind === 'anime') items = items.filter((e) => !isDonghua(e));
  if (ui.kind === 'donghua') items = items.filter(isDonghua);
  const sorters = {
    updated: (a, b) => b.updated_at.localeCompare(a.updated_at),
    title: (a, b) => a.title.localeCompare(b.title),
    score: (a, b) => b.score - a.score || a.title.localeCompare(b.title),
  };
  items.sort(sorters[ui.sort] || sorters.updated);

  const opt = (v, l) => `<option value="${v}"${v === ui.sort ? ' selected' : ''}>${l}</option>`;
  main.innerHTML = `
    <div class="chips scroll" role="tablist" aria-label="Lists">
      ${STATUSES.map(([k, l]) => `<button class="chip${k === ui.status ? ' on' : ''}" role="tab" aria-selected="${k === ui.status}" data-status-tab="${k}">${l}<span class="count">${count(k)}</span></button>`).join('')}
    </div>
    <div class="tools">
      <div class="seg" role="group" aria-label="Show type">
        ${[['all', 'All'], ['anime', 'Anime'], ['donghua', 'Donghua']].map(([k, l]) => `<button class="${k === ui.kind ? 'on' : ''}" aria-pressed="${k === ui.kind}" data-kind="${k}">${l}</button>`).join('')}
      </div>
      <select id="sortSel" aria-label="Sort by">
        ${opt('updated', 'Recent')}${opt('title', 'Title A–Z')}${opt('score', 'Rating')}
      </select>
    </div>
    ${items.length ? `<div class="cards">${items.map(card).join('')}</div>` : emptyState()}
    ${store.cloudEnabled ? '' : '<p class="local-note">Saved on this device only.</p>'}`;
}

/* ---------- airing view ---------- */

function dayLabel(d) {
  const today = new Date().setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
}

function renderAiring() {
  const rows = store.all()
    .filter((e) => ['watching', 'planning', 'paused'].includes(e.status) && nextOf(e))
    .map((e) => ({ e, n: nextOf(e) }))
    .sort((a, b) => a.n.airingAt - b.n.airingAt);

  const groups = [];
  for (const r of rows) {
    const d = new Date(r.n.airingAt * 1000);
    const label = dayLabel(d);
    if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
    groups.at(-1).items.push({ ...r, time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) });
  }

  const body = !airingLoaded && !rows.length
    ? '<p class="dim center">Checking the schedule…</p>'
    : !groups.length
      ? `<div class="empty">${MOCHI}<p>No airing shows on your lists right now. Currently-airing shows you add will appear here with a countdown.</p></div>`
      : groups.map((g) => `<section class="day"><h3>${g.label}</h3><ul>
          ${g.items.map(({ e, n, time }) => `<li><button class="air-row" data-open="${e.id}" style="--tint:${tintOf(e)}">
            <span class="time">${time}</span>
            <img class="sticker sm" src="${esc(e.cover_url)}" alt="" loading="lazy">
            <span class="air-title">${esc(e.title)}<small>ep ${n.episode} · in <b data-cd="${n.airingAt}">${countdown(n.airingAt)}</b>${e.status !== 'watching' ? ` · ${STATUS_LABEL[e.status]}` : ''}</small></span>
          </button></li>`).join('')}
        </ul></section>`).join('');

  main.innerHTML = `<div class="air-head"><h2>Airing soon</h2><p class="dim">Next episodes of shows on your lists, in your time zone.</p></div>${body}`;
}

function render() {
  const chips = $('.chips.scroll');
  const scrollLeft = chips ? chips.scrollLeft : 0;
  if (ui.view === 'airing') renderAiring();
  else renderList();
  const newChips = $('.chips.scroll');
  if (newChips) newChips.scrollLeft = scrollLeft;
  document.querySelectorAll('.nav-btn[data-view]').forEach((b) => {
    if (b.dataset.view === ui.view) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
}

let airingBusy = false;
async function loadAiring() {
  if (airingBusy) return;
  airingBusy = true;
  const ids = store.all().filter((e) => !['completed', 'dropped'].includes(e.status)).map((e) => e.anilist_id);
  try {
    airing = await getAiring(ids);
  } catch (err) {
    console.warn('airing fetch failed', err);
  }
  airingBusy = false;
  airingLoaded = true;
  render();
}

/* ---------- actions ---------- */

async function safe(promise) {
  try { await promise; return true; }
  catch (err) {
    console.error(err);
    toast("Couldn't save that. Check your connection and try again.");
    return false;
  }
}

async function setProgress(id, value) {
  const e = store.get(id);
  const total = totalOf(e);
  value = Math.max(0, total ? Math.min(total, value) : value);
  if (Number.isNaN(value) || value === e.progress) return renderDetail();
  const patch = { progress: value };
  if (value > e.progress && ['planning', 'paused', 'dropped'].includes(e.status)) patch.status = 'watching';
  if (!(await safe(store.update(id, patch)))) return;
  renderDetail();
  if (total && value === total && e.status !== 'completed') {
    toast(`That was the last episode of ${e.title}!`, { label: 'Mark completed', fn: () => setStatus(id, 'completed') });
  } else if (patch.status) {
    toast('Moved to Watching ✿');
  }
}

async function setStatus(id, status) {
  const e = store.get(id);
  if (!e || e.status === status) return;
  const patch = { status };
  const total = totalOf(e);
  if (status === 'completed' && total) patch.progress = total;
  if (!(await safe(store.update(id, patch)))) return;
  renderDetail();
  if (status === 'completed') {
    burst();
    toast(`${e.title} is finished! ✿`);
  } else {
    toast(`Moved to ${STATUS_LABEL[status]}`);
  }
}

/* ---------- search ---------- */

function openSearch() {
  if (!searchDlg.open) searchDlg.showModal();
  const q = $('#q');
  q.value = '';
  renderResults(null);
  q.focus();
}

function renderResults(state) {
  const box = $('#results');
  if (state === null) {
    box.innerHTML = `<div class="hint"><p>Search by English, romaji or native title.</p>
      <div class="chips wrap">${SUGGESTIONS.map((s) => `<button class="chip" data-suggest="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`;
  } else if (state === 'loading') {
    box.innerHTML = '<p class="dim center">Searching…</p>';
  } else if (state === 'error') {
    box.innerHTML = '<p class="dim center">AniList is being shy right now. Try again in a moment.</p>';
  } else if (!lastResults.length) {
    box.innerHTML = '<p class="dim center">Nothing found. Try another spelling?</p>';
  } else {
    box.innerHTML = `<ul>${lastResults.map((r, i) => {
      const have = store.findByAnilist(r.anilist_id);
      const eps = r.total_eps ? `${r.total_eps} eps` : r.airing_status === 'RELEASING' ? 'airing' : '';
      return `<li class="result" style="--tint:${tintOf(r)}">
        <img class="sticker sm" src="${esc(r.cover_url)}" alt="" loading="lazy">
        <div class="r-info">
          <b>${esc(r.title)}</b>
          ${r.title_native ? `<small>${esc(r.title_native)}</small>` : ''}
          <div class="meta">${badges(r)}${eps ? `<span class="dim">${eps}</span>` : ''}</div>
          <div class="r-actions">${have
            ? `<button class="pill ghost" data-open="${have.id}">On ${esc(STATUS_LABEL[have.status])} ✓</button>`
            : `<button class="pill" data-add="${i}" data-as="watching">▶ Watching</button>
               <button class="pill soft" data-add="${i}" data-as="planning">+ Plan to watch</button>`}
          </div>
        </div>
      </li>`;
    }).join('')}</ul>`;
  }
}

let searchTimer;
let searchAbort;
function onSearchInput() {
  const q = $('#q').value.trim();
  clearTimeout(searchTimer);
  if (q.length < 2) return renderResults(null);
  searchTimer = setTimeout(async () => {
    searchAbort?.abort();
    searchAbort = new AbortController();
    renderResults('loading');
    try {
      lastResults = await searchAnime(q, searchAbort.signal);
      renderResults('done');
    } catch (err) {
      if (err.name !== 'AbortError') renderResults('error');
    }
  }, 350);
}

async function addFromSearch(i, status) {
  const show = lastResults[i];
  if (!show || store.findByAnilist(show.anilist_id)) return;
  if (!(await safe(store.add(show, status)))) return;
  ui.view = 'list';
  ui.status = status;
  saveUi();
  render();
  renderResults('done');
  toast(`Added to ${STATUS_LABEL[status]} ✿`);
}

/* ---------- detail sheet ---------- */

function openDetail(id) {
  if (searchDlg.open) searchDlg.close();
  openId = id;
  renderDetail();
  if (!detailDlg.open) detailDlg.showModal();
}

function renderDetail() {
  if (!openId) return;
  const e = store.get(openId);
  if (!e) { detailDlg.close(); return; }
  const total = totalOf(e);
  const next = nextOf(e);
  const hearts = Array.from({ length: 10 }, (_, k) => k + 1)
    .map((n) => `<button class="heart${n <= e.score ? ' on' : ''}" data-score="${n}" role="radio" aria-checked="${n === e.score}" aria-label="${n} out of 10">♥</button>`)
    .join('');
  detailDlg.innerHTML = `<div class="sheet detail" style="--tint:${tintOf(e)}">
    <button class="icon-btn close" data-close aria-label="Close">×</button>
    <div class="d-top">
      <img class="sticker big" src="${esc(e.cover_url)}" alt="">
      <div class="d-head">
        <h2>${esc(e.title)}</h2>
        ${e.title_native ? `<p class="native">${esc(e.title_native)}</p>` : ''}
        <div class="meta">${badges(e)}</div>
        ${next ? `<p class="next">✦ ep ${next.episode} in <b data-cd="${next.airingAt}">${countdown(next.airingAt)}</b></p>` : ''}
        <a class="al-link" href="https://anilist.co/anime/${e.anilist_id}" target="_blank" rel="noopener">View on AniList ↗</a>
      </div>
    </div>
    <section class="d-sec"><h3>List</h3>
      <div class="chips wrap">${STATUSES.map(([k, l]) => `<button class="chip${e.status === k ? ' on' : ''}" aria-pressed="${e.status === k}" data-set-status="${k}">${l}</button>`).join('')}</div>
    </section>
    <section class="d-sec"><h3>Progress</h3>
      <div class="stepper">
        <button data-step="-1" aria-label="One episode less">−</button>
        <input id="dProg" type="number" inputmode="numeric" min="0" ${total ? `max="${total}"` : ''} value="${e.progress}" aria-label="Episodes watched">
        <span class="of">/ ${total ?? '?'} eps</span>
        <button data-step="1" aria-label="One episode more">+</button>
      </div>
    </section>
    <section class="d-sec"><h3>Rating <span class="dim">${e.score ? e.score + ' / 10' : 'not rated yet'}</span></h3>
      <div class="hearts" role="radiogroup" aria-label="Rating">${hearts}</div>
    </section>
    <section class="d-sec"><h3>Notes <span class="dim" id="savedLbl"></span></h3>
      <textarea id="dNotes" rows="3" placeholder="Favourite character, where you stopped, who recommended it…">${esc(e.notes)}</textarea>
    </section>
    <button class="remove" data-remove>Remove from list</button>
  </div>`;
}

let notesTimer;
function flushNotes() {
  clearTimeout(notesTimer);
  const ta = $('#dNotes');
  const e = openId && store.get(openId);
  if (!ta || !e || ta.value === e.notes) return;
  safe(store.update(e.id, { notes: ta.value })).then((ok) => {
    const lbl = $('#savedLbl');
    if (ok && lbl) lbl.textContent = 'saved ✓';
  });
}

/* ---------- toast + sparkles ---------- */

const toastEl = $('#toast');
let toastTimer;
function toast(msg, action) {
  // Lives inside an open modal dialog so its button stays clickable.
  (document.querySelector('dialog[open]') || document.body).appendChild(toastEl);
  toastEl.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="toast-btn">${esc(action.label)}</button>` : ''}`;
  if (action) toastEl.querySelector('button').onclick = () => { toastEl.classList.remove('show'); action.fn(); };
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), action ? 6000 : 2600);
}

function burst(x = innerWidth / 2, y = innerHeight / 2) {
  const host = document.querySelector('dialog[open]') || document.body;
  const glyphs = ['✦', '✿', '♥', '★'];
  for (let i = 0; i < 18; i++) {
    const s = document.createElement('span');
    const a = (Math.PI * 2 * i) / 18 + Math.random() * 0.4;
    const r = 70 + Math.random() * 80;
    s.className = 'spark';
    s.textContent = glyphs[i % 4];
    s.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r}px;--c:var(--c${i % 3})`;
    host.appendChild(s);
    setTimeout(() => s.remove(), 1000);
  }
}

/* ---------- theme ---------- */

function toggleTheme() {
  const current = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const t = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('cc.theme', t); } catch {}
}

/* ---------- events ---------- */

let removeArmed = null;
let signOutArmed = false;

document.addEventListener('click', (ev) => {
  const dlg = ev.target.closest('dialog');
  if (dlg && ev.target === dlg) return dlg.close(); // backdrop tap
  const t = ev.target.closest('button');
  if (!t) return;
  const d = t.dataset;

  if (d.view) {
    ui.view = d.view; saveUi(); render(); scrollTo(0, 0);
  } else if (d.action === 'search') {
    openSearch();
  } else if (d.statusTab) {
    ui.status = d.statusTab; saveUi(); render();
  } else if (d.kind) {
    ui.kind = d.kind; saveUi(); render();
  } else if (d.plus) {
    const e = store.get(d.plus);
    const total = totalOf(e);
    if (total && e.progress >= total) toast('Already at the last episode ✿');
    else setProgress(d.plus, e.progress + 1);
  } else if (d.open) {
    openDetail(d.open);
  } else if (d.suggest) {
    $('#q').value = d.suggest; onSearchInput();
  } else if (d.add) {
    addFromSearch(Number(d.add), d.as);
  } else if (d.setStatus) {
    setStatus(openId, d.setStatus);
  } else if (d.step) {
    setProgress(openId, store.get(openId).progress + Number(d.step));
  } else if (d.score) {
    const n = Number(d.score);
    const e = store.get(openId);
    safe(store.update(openId, { score: e.score === n ? 0 : n })).then(renderDetail);
  } else if ('remove' in d) {
    if (removeArmed !== openId) {
      removeArmed = openId;
      t.textContent = 'Tap again to remove';
      t.classList.add('armed');
      setTimeout(() => { removeArmed = null; t.textContent = 'Remove from list'; t.classList.remove('armed'); }, 3000);
    } else {
      const title = store.get(openId).title;
      safe(store.remove(openId));
      detailDlg.close();
      toast(`Removed ${title}`);
    }
  } else if ('close' in d) {
    t.closest('dialog').close();
  } else if (t.id === 'themeBtn') {
    toggleTheme();
  } else if (t.id === 'signOutBtn') {
    if (signOutArmed) return store.signOut();
    signOutArmed = true;
    toast('Tap again to sign out');
    setTimeout(() => { signOutArmed = false; }, 3000);
  }
});

document.addEventListener('change', (ev) => {
  if (ev.target.id === 'sortSel') { ui.sort = ev.target.value; saveUi(); render(); }
  if (ev.target.id === 'dProg') setProgress(openId, parseInt(ev.target.value, 10));
});

document.addEventListener('input', (ev) => {
  if (ev.target.id === 'q') onSearchInput();
  if (ev.target.id === 'dNotes') {
    $('#savedLbl').textContent = '';
    clearTimeout(notesTimer);
    notesTimer = setTimeout(flushNotes, 700);
  }
});

detailDlg.addEventListener('close', () => { flushNotes(); openId = null; });

setInterval(() => {
  document.querySelectorAll('[data-cd]').forEach((el) => { el.textContent = countdown(Number(el.dataset.cd)); });
}, 30000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadAiring();
});

/* ---------- login ---------- */

function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
  const err = $('#loginErr');
  let email = '';
  $('#loginForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    err.textContent = '';
    email = $('#email').value.trim();
    const btn = ev.submitter;
    btn.disabled = true;
    try {
      await store.sendLoginEmail(email);
      $('#loginForm').hidden = true;
      $('#codeForm').hidden = false;
      $('#sentTo').textContent = email;
      $('#code').focus();
    } catch (e) {
      err.textContent = e.message || 'Could not send the email.';
    }
    btn.disabled = false;
  });
  $('#codeForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    err.textContent = '';
    try {
      await store.verifyCode(email, $('#code').value.trim());
      showApp('cloud');
    } catch {
      err.textContent = 'That code didn’t work. Check it, or send a new email.';
    }
  });
  $('#backBtn').addEventListener('click', () => {
    $('#codeForm').hidden = true;
    $('#loginForm').hidden = false;
  });
}

function showApp(mode) {
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#signOutBtn').hidden = mode !== 'cloud';
  store.subscribe(() => {
    render();
    if (store.all().some((e) => !(e.anilist_id in airing) && !['completed', 'dropped'].includes(e.status))) loadAiring();
  });
  render();
  loadAiring();
}

async function boot() {
  $('#greet').textContent = HER_NAME ? `hi ${HER_NAME} ✿` : 'anime & donghua shelf';
  let mode;
  try {
    mode = await store.init();
  } catch (err) {
    console.error(err);
    toast("Couldn't reach the sync server. Showing this device's copy.");
    mode = 'local';
  }
  if (mode === 'login') showLogin();
  else showApp(mode);
}

boot();

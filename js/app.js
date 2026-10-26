import * as store from './store.js';
import { searchAnime, getAiring, getRecommendations, clearRecommendationCache } from './anilist.js';
import { SUBTITLE, APK_URL } from './config.js';

const STATUSES = [
  ['watching', 'Watching'],
  ['planning', 'Plan to watch'],
  ['completed', 'Completed'],
  ['paused', 'On hold'],
  ['dropped', 'Dropped'],
];
const STATUS_LABEL = Object.fromEntries(STATUSES);
const FORMAT_LABEL = { TV: 'TV', TV_SHORT: 'Short', MOVIE: 'Movie', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music' };
// U+FE0E asks for the plain text heart; without it Android draws a red emoji heart that ignores CSS colour.
const HEART = '♥\uFE0E';
const HEART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 5.3 3.2 1.7-2 3.2-3.2 5.3-3.2 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>';
const SUGGESTIONS = ['Frieren', 'Link Click', 'Mo Dao Zu Shi', 'Spy x Family'];
const mochi = (cls = '') => `<svg class="mochi ${cls}" viewBox="0 0 120 100" aria-hidden="true">
  <path d="M24 44 L30 12 L52 32 Z" class="m-body m-ear m-ear-l"/>
  <path d="M96 44 L90 12 L68 32 Z" class="m-body m-ear m-ear-r"/>
  <ellipse cx="60" cy="62" rx="48" ry="34" class="m-body"/>
  <g class="m-eyes"><circle cx="44" cy="60" r="4.5" class="m-ink"/><circle cx="76" cy="60" r="4.5" class="m-ink"/></g>
  <ellipse cx="34" cy="70" rx="7" ry="4" class="m-blush"/><ellipse cx="86" cy="70" rx="7" ry="4" class="m-blush"/>
  <path d="M54 68 q3 4 6 0 q3 4 6 0" class="m-mouth"/>
</svg>`;

const ui = { view: 'list', status: 'watching', kind: 'all', sort: 'updated' };
try { Object.assign(ui, JSON.parse(localStorage.getItem('cc.ui')), { kind: 'all' }); } catch {}
let openId = null;
let airing = {};
let airingLoaded = false;
let lastResults = [];
// "For you": sections of suggestions, plus a lookup of every suggestion we've fetched.
let recs = { sig: null, loading: false, error: false, sections: [] };
const recShows = new Map();
let previewId = null;
let editingTotal = false;

const $ = (s, el = document) => el.querySelector(s);
const main = $('#main');
const searchDlg = $('#searchDlg');
const detailDlg = $('#detailDlg');
const settingsDlg = $('#settingsDlg');
const previewDlg = $('#previewDlg');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// The Anime/Donghua filter isn't remembered, so a forgotten filter never hides half her shelf.
const saveUi = () => { try { localStorage.setItem('cc.ui', JSON.stringify({ ...ui, kind: 'all' })); } catch {} };
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const buzz = (ms = 12) => { try { navigator.vibrate?.(ms); } catch {} };
const isApp = Boolean(window.Capacitor?.isNativePlatform?.());
const VERSION_URL = 'https://desolatemartial553.github.io/anime-tracker/version.json';
let appInfo = null; // { version, build } of the installed app
let update = null; // version.json contents when a newer app build is published

const isDonghua = (e) => e.country === 'CN';
const tintOf = (e) => (/^#[0-9a-f]{6}$/i.test(e.cover_color || '') ? e.cover_color : '#ff8fb8');
const totalOf = (e) => e.total_eps || airing[e.anilist_id]?.episodes || null;
const pctOf = (e) => {
  const total = totalOf(e);
  return total ? Math.min(100, (e.progress / total) * 100) : e.progress ? 100 : 0;
};
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

function shelfStats(list) {
  let eps = 0, rated = 0, sum = 0, airingNext = 0;
  for (const e of list) {
    eps += e.progress || 0;
    if (e.score) { rated++; sum += e.score; }
    if (nextOf(e)) airingNext++;
  }
  return {
    shows: list.length,
    eps,
    avg: rated ? `${(sum / rated).toFixed(1)} / 10` : '—',
    airingNext,
  };
}

function statsStrip(s) {
  if (!s.shows) return '';
  const tiles = [
    [HEART, 'Shows', s.shows],
    ['▶', 'Episodes', s.eps],
    ['✿', 'Avg rating', s.avg],
    ['✦', 'Airing next', s.airingNext],
  ];
  return `<div class="stats" aria-label="Shelf stats">${tiles.map(([ico, label, val], i) =>
    `<div class="stat" style="--tint:var(--c${i % 3})">
       <span class="stat-ico" aria-hidden="true">${ico}</span>
       <div><small>${label}</small><b>${esc(String(val))}</b></div>
     </div>`).join('')}</div>`;
}

function card(e, i) {
  const total = totalOf(e);
  const next = nextOf(e);
  return `<article class="card" data-id="${e.id}" style="--tint:${tintOf(e)};--i:${Math.min(i, 10)}">
    <button class="cover-btn" data-open="${e.id}" aria-label="Open ${esc(e.title)}">
      <img class="sticker" src="${esc(e.cover_url)}" alt="" loading="lazy">
    </button>
    <div class="card-body">
      <button class="title" data-open="${e.id}">${esc(e.title)}</button>
      <div class="meta">${badges(e)}${e.score ? `<span class="score">${HEART} ${e.score}</span>` : ''}</div>
      <div class="prog">
        <div class="bar${total ? '' : ' unknown'}"><i style="width:${pctOf(e)}%"></i></div>
        <span>ep <b class="ep">${e.progress}</b> / ${total ?? '?'}</span>
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
  return `<div class="empty">${mochi('alive')}<p>${msg}</p>${cta ? `<button class="pill" data-action="search">${cta}</button>` : ''}</div>`;
}

function appPromo() {
  let hidden = true;
  try { hidden = isApp || !/Android/i.test(navigator.userAgent) || localStorage.getItem('cc.appPromo') === 'hidden'; } catch {}
  if (hidden) return '';
  return `<div class="app-promo">
    ${mochi()}
    <div><b>Get the Cozy Corner app</b><small>Your shelf as a real app on your phone</small></div>
    <a class="pill" href="${APK_URL}">Download</a>
    <button class="icon-btn" data-hide-promo aria-label="Hide this">×</button>
  </div>`;
}

function updateCard() {
  let dismissed = null;
  try { dismissed = localStorage.getItem('cc.updateDismissed'); } catch {}
  if (!update || dismissed === String(update.versionCode)) return '';
  return `<div class="app-promo update-card">
    ${mochi('alive')}
    <div><b>Cozy Corner ${esc(update.versionName)} is ready ✿</b><small>${esc(update.notes || 'A fresh update with little improvements.')}</small></div>
    <a class="pill" href="${esc(update.apk || APK_URL)}">Update</a>
    <button class="icon-btn" data-hide-update aria-label="Remind me later">×</button>
  </div>`;
}

function renderList() {
  const list = store.all();
  const count = (k) => list.filter((e) => e.status === k).length;
  let items = list.filter((e) => e.status === ui.status);  if (ui.kind === 'anime') items = items.filter((e) => !isDonghua(e));
  if (ui.kind === 'donghua') items = items.filter(isDonghua);
  const sorters = {
    updated: (a, b) => b.updated_at.localeCompare(a.updated_at),
    title: (a, b) => a.title.localeCompare(b.title),
    score: (a, b) => b.score - a.score || a.title.localeCompare(b.title),
  };
  items.sort(sorters[ui.sort] || sorters.updated);

  const opt = (v, l) => `<option value="${v}"${v === ui.sort ? ' selected' : ''}>${l}</option>`;
  main.innerHTML = `
    ${updateCard()}
    <div class="chips scroll" role="tablist" aria-label="Lists">
      <span class="ind" aria-hidden="true"></span>
      ${STATUSES.map(([k, l]) => `<button class="chip${k === ui.status ? ' on' : ''}" role="tab" aria-selected="${k === ui.status}" data-status-tab="${k}">${l}<span class="count">${count(k)}</span></button>`).join('')}
    </div>
    <div class="tools">
      <div class="seg" role="group" aria-label="Show type">
        <span class="ind" aria-hidden="true"></span>
        ${[['all', 'All'], ['anime', 'Anime'], ['donghua', 'Donghua']].map(([k, l]) => `<button class="${k === ui.kind ? 'on' : ''}" aria-pressed="${k === ui.kind}" data-kind="${k}">${l}</button>`).join('')}
      </div>
      <select id="sortSel" aria-label="Sort by">
        ${opt('updated', 'Recent')}${opt('title', 'Title A–Z')}${opt('score', 'Rating')}
      </select>
    </div>
    ${items.length ? `<div class="cards">${items.map(card).join('')}</div>` : emptyState()}
    ${statsStrip(shelfStats(list))}
    ${appPromo()}
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

  let i = 0;
  const body = !airingLoaded && !rows.length
    ? '<p class="dim center">Checking the schedule…</p>'
    : !groups.length
      ? `<div class="empty">${mochi('alive')}<p>No airing shows on your lists right now. Currently-airing shows you add will appear here with a countdown.</p></div>`
      : groups.map((g) => `<section class="day"><h3>${g.label}</h3><ul>
          ${g.items.map(({ e, n, time }) => `<li style="--i:${Math.min(i++, 10)}"><button class="air-row" data-open="${e.id}" style="--tint:${tintOf(e)}">
            <span class="time">${time}</span>
            <img class="sticker sm" src="${esc(e.cover_url)}" alt="" loading="lazy">
            <span class="air-title">${esc(e.title)}<small>ep ${n.episode} · in <b data-cd="${n.airingAt}">${countdown(n.airingAt)}</b>${e.status !== 'watching' ? ` · ${STATUS_LABEL[e.status]}` : ''}</small></span>
          </button></li>`).join('')}
        </ul></section>`).join('');

  main.innerHTML = `<div class="air-head"><h2>Airing soon</h2><p class="dim">Next episodes of shows on your lists, in your time zone.</p></div>${body}`;
}

/* ---------- "For you" ---------- */

const WHY = {
  watching: "Because you're watching",
  completed: 'Because you finished',
  paused: "Because you're partway through",
  planning: "Because it's on your list",
};

// The shows worth building suggestions from: what she's watching now first,
// then what she finished, then the rest. Six is plenty and keeps the API happy.
function recSources() {
  const rank = { watching: 0, completed: 1, paused: 2, planning: 3 };
  return store.all()
    .filter((e) => e.status in rank)
    .sort((a, b) => rank[a.status] - rank[b.status] || (b.updated_at || '').localeCompare(a.updated_at || ''))
    .slice(0, 6)
    .map((e) => ({ anilist_id: e.anilist_id, title: e.title, status: e.status, country: e.country }));
}

async function loadRecs({ force = false } = {}) {
  if (recs.loading) return;
  const sources = recSources();
  const sig = sources.map((s) => `${s.anilist_id}:${s.status}`).join(',');
  if (!force && sig === recs.sig) return; // nothing changed since the last fetch
  const keep = sig === recs.sig ? recs.sections : [];
  recs = { sig, loading: true, error: false, sections: keep };
  if (ui.view === 'foryou') renderForYou();
  try {
    if (force) clearRecommendationCache();
    const sections = sources.length ? await getRecommendations(sources) : [];
    for (const s of sections) for (const it of s.items) recShows.set(it.anilist_id, it);
    recs = { sig, loading: false, error: false, sections };
  } catch (err) {
    console.warn('recommendations failed', err);
    recs = { sig, loading: false, error: true, sections: keep };
  }
  if (ui.view === 'foryou') renderForYou();
}

const cut = (s, n) => (s.length > n ? s.slice(0, s.lastIndexOf(' ', n)) + '…' : s);

function recSection(s, i) {
  return `<section class="rec" style="--i:${Math.min(i, 8)}">
    <h3>${WHY[s.status] || 'Because you liked'} <b>${esc(s.title)}</b></h3>
    <ul class="rec-row">${s.items.slice(0, 8).map((it, k) => `
      <li style="--tint:${tintOf(it)};--i:${k}">
        <button class="rec-tile" data-preview="${it.anilist_id}" aria-label="More about ${esc(it.title)}">
          <span class="rec-cover">
            <img src="${esc(it.cover_url)}" alt="" loading="lazy">
            <span class="rec-plus" aria-hidden="true">+</span>
          </span>
          <span class="rec-name">${esc(it.title)}</span>
          <span class="rec-meta">${isDonghua(it) ? 'Donghua' : 'Anime'}${it.year ? ` · ${it.year}` : ''}${it.total_eps ? ` · ${it.total_eps} ep` : ''}</span>
        </button>
      </li>`).join('')}
    </ul>
  </section>`;
}

function renderForYou() {
  const head = `<div class="air-head rec-head">
    <div><h2>For you</h2><p class="dim">Picked from what's on your shelf.</p></div>
    <button class="icon-btn" data-rec-refresh aria-label="Find new suggestions">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg>
    </button>
  </div>`;

  if (!store.all().length) {
    main.innerHTML = `${head}<div class="empty">${mochi('alive')}
      <p>Add a few shows to your shelf and this page will start suggesting more like them.</p>
      <button class="pill" data-action="search">Find something to watch</button></div>`;
    return;
  }

  // Shows she already added shouldn't be suggested again.
  const sections = recs.sections
    .map((s) => ({ ...s, items: s.items.filter((it) => !store.findByAnilist(it.anilist_id)) }))
    .filter((s) => s.items.length);

  let body;
  if (sections.length) body = sections.map(recSection).join('');
  else if (recs.loading) body = '<div class="loading" aria-label="Finding shows you might like"><span></span><span></span><span></span></div>';
  else if (recs.error) body = `<div class="empty">${mochi()}<p>Couldn't reach AniList just now.</p><button class="pill" data-rec-refresh>Try again</button></div>`;
  else body = `<div class="empty">${mochi('alive')}<p>Add a couple more shows and suggestions will appear here.</p><button class="pill" data-action="search">Add a show</button></div>`;

  main.innerHTML = head + body;
}

/* ---------- preview sheet (a suggestion before adding it) ---------- */

function openPreview(aid) {
  previewId = aid;
  renderPreview();
  openSheet(previewDlg);
}

function renderPreview() {
  const show = recShows.get(previewId);
  if (!show) return;
  const have = store.findByAnilist(previewId);
  const score = show.community ? Math.round(show.community / 10) : 0;
  previewDlg.style.setProperty('--tint', tintOf(show));
  previewDlg.innerHTML = `<div class="sheet detail" style="--tint:${tintOf(show)}">
    <div class="grab" aria-hidden="true"></div>
    <button class="icon-btn close" data-close aria-label="Close">×</button>
    <div class="d-top">
      <img class="sticker big" src="${esc(show.cover_url)}" alt="">
      <div class="d-head">
        <h2>${esc(show.title)}</h2>
        ${show.title_native ? `<p class="native">${esc(show.title_native)}</p>` : ''}
        <div class="meta">${badges(show)}${score ? `<span class="score">${HEART} ${score}</span>` : ''}</div>
        <a class="al-link" href="https://anilist.co/anime/${show.anilist_id}" target="_blank" rel="noopener">View on AniList ↗</a>
      </div>
    </div>
    ${show.description ? `<p class="d-desc">${esc(cut(show.description, 330))}</p>` : ''}
    <div class="preview-actions">${have
      ? `<button class="pill ghost" data-open="${have.id}">On ${esc(STATUS_LABEL[have.status])} ✓</button>`
      : `<button class="pill" data-addrec="watching">▶ Watching</button>
         <button class="pill soft" data-addrec="planning">+ Plan to watch</button>`}
    </div>
  </div>`;
}

async function addRecommended(status) {
  const show = recShows.get(previewId);
  if (!show || store.findByAnilist(show.anilist_id)) return;
  const pending = store.add(show, status);
  buzz();
  burst(innerWidth / 2, innerHeight * 0.4, { count: 10, dist: 60, size: 16 });
  toast(`Added to ${STATUS_LABEL[status]} ✿`);
  closeSheet(previewDlg);
  render();
  if (!(await safe(pending))) render();
}

// The pink "active" pill glides from the previous chip to the new one.
const indPos = {};
function placeInd(sel, key) {
  const box = $(sel, main);
  const on = box?.querySelector('.on');
  const ind = box?.querySelector('.ind');
  if (!on || !ind) return;
  const to = { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
  const apply = (p) => {
    ind.style.transform = `translate(${p.x}px, ${p.y}px)`;
    ind.style.width = p.w + 'px';
    ind.style.height = p.h + 'px';
  };
  box.classList.add('has-ind');
  const from = indPos[key];
  if (from && !reduceMotion()) {
    ind.style.transition = 'none';
    apply(from);
    void ind.offsetWidth;
    ind.style.transition = '';
  }
  apply(to);
  indPos[key] = to;
}

function render(animate = false) {
  const chips = $('.chips.scroll');
  const scrollLeft = chips ? chips.scrollLeft : 0;
  main.classList.remove('animate');
  if (ui.view === 'airing') renderAiring();
  else if (ui.view === 'foryou') { renderForYou(); loadRecs(); }
  else renderList();
  const newChips = $('.chips.scroll');
  if (newChips) newChips.scrollLeft = scrollLeft;
  if (animate && !reduceMotion()) {
    void main.offsetWidth;
    main.classList.add('animate');
  }
  if (ui.view === 'list') {
    placeInd('.chips.scroll', 'status');
    placeInd('.seg', 'kind');
  }
  document.querySelectorAll('.nav-btn[data-view]').forEach((b) => {
    if (b.dataset.view === ui.view) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
}

// Keeps the chosen status chip fully on screen in the sideways-scrolling row.
function revealActiveChip() {
  const box = $('.chips.scroll');
  const on = box?.querySelector('.on');
  if (!on) return;
  const left = on.offsetLeft - 16;
  const right = on.offsetLeft + on.offsetWidth + 16 - box.clientWidth;
  if (box.scrollLeft > left) box.scrollTo({ left, behavior: 'smooth' });
  else if (box.scrollLeft < right) box.scrollTo({ left: right, behavior: 'smooth' });
}

let airingBusy = false;
async function loadAiring() {
  if (airingBusy) return;
  airingBusy = true;
  const ids = store.all().filter((e) => !['completed', 'dropped'].includes(e.status)).map((e) => e.anilist_id);
  const before = JSON.stringify(airing);
  try {
    airing = await getAiring(ids);
  } catch (err) {
    console.warn('airing fetch failed', err);
  }
  airingBusy = false;
  const changed = !airingLoaded || JSON.stringify(airing) !== before;
  airingLoaded = true;
  // Skipping no-op re-renders keeps the card pop-in animation from being cut short.
  if (changed) render();
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

// Optimistic update: the store re-renders the shelf straight away, the detail sheet follows.
async function change(id, patch) {
  const pending = store.update(id, patch);
  renderDetail();
  const ok = await safe(pending);
  if (!ok) renderDetail();
  return ok;
}

async function setProgress(id, value, fromRect = null) {
  const e = store.get(id);
  const total = totalOf(e);
  value = Math.max(0, total ? Math.min(total, value) : value);
  if (Number.isNaN(value) || value === e.progress) return renderDetail();
  const prevPct = pctOf(e);
  const patch = { progress: value };
  if (value > e.progress && ['planning', 'paused', 'dropped'].includes(e.status)) patch.status = 'watching';
  const pending = change(id, patch);
  buzz();
  if (fromRect) celebratePlus(id, prevPct, fromRect);
  else bumpDetailProgress();
  if (!(await pending)) return;
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
  const pending = change(id, patch);
  if (status === 'completed') {
    celebrate();
    toast(`${e.title} is finished!`, null, true);
  } else {
    toast(`Moved to ${STATUS_LABEL[status]}`);
  }
  await pending;
}

/* ---------- little animations ---------- */

function floatText(text, x, y) {
  if (reduceMotion()) return;
  const s = document.createElement('span');
  s.className = 'float-up';
  s.textContent = text;
  s.style.cssText = `left:${x}px;top:${y}px`;
  (document.querySelector('dialog[open]') || document.body).appendChild(s);
  setTimeout(() => s.remove(), 1000);
}

function celebratePlus(id, prevPct, rect) {
  floatText(`+1 ${HEART}`, rect.left + rect.width / 2, rect.top);
  if (reduceMotion()) return;
  const el = main.querySelector(`.card[data-id="${id}"]`);
  if (!el) return; // it moved to another list
  el.querySelector('.plus1')?.classList.add('squish');
  el.querySelector('.ep')?.classList.add('flip');
  const bar = el.querySelector('.bar i');
  if (bar) {
    const to = bar.style.width;
    bar.style.transition = 'none';
    bar.style.width = prevPct + '%';
    void bar.offsetWidth;
    bar.style.transition = '';
    bar.style.width = to;
  }
}

function bumpDetailProgress() {
  if (reduceMotion()) return;
  $('#dProg')?.classList.add('flip');
}

function heartsRipple(n, rect) {
  buzz(8);
  if (reduceMotion()) return;
  detailDlg.querySelectorAll('.heart').forEach((h, k) => {
    if (k >= n) return;
    h.style.setProperty('--d', k * 28 + 'ms');
    h.classList.add(k === n - 1 ? 'pop' : 'ripple');
  });
  burst(rect.left + rect.width / 2, rect.top + rect.height / 2, { count: 8, glyphs: [HEART], dist: 46, size: 13 });
}

function burst(x = innerWidth / 2, y = innerHeight / 2, { count = 18, glyphs = ['✦', '✿', HEART, '★'], dist = 110, size = 20, delay = 0 } = {}) {
  if (reduceMotion()) return;
  const host = document.querySelector('dialog[open]') || document.body;
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const r = dist * (0.6 + Math.random() * 0.7);
    s.className = 'spark';
    s.textContent = glyphs[i % glyphs.length];
    s.style.cssText = `left:${x}px;top:${y}px;font-size:${size}px;animation-delay:${delay}ms;--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r}px;--c:var(--c${i % 3})`;
    host.appendChild(s);
    setTimeout(() => s.remove(), 1100 + delay);
  }
}

function celebrate() {
  buzz([12, 60, 18]);
  const x = innerWidth / 2, y = innerHeight * 0.45;
  burst(x, y, { count: 22, dist: 150 });
  burst(x, y, { count: 14, glyphs: ['❀', '✿'], dist: 90, size: 24, delay: 150 });
}

function hideSplash() {
  const s = $('#splash');
  if (!s) return;
  setTimeout(() => {
    s.classList.add('out');
    setTimeout(() => s.remove(), 500);
  }, reduceMotion() ? 0 : 650);
}

// Drifting sakura petals by day, twinkling stars by night (CSS decides which).
function ambient() {
  if (reduceMotion()) return;
  const r = (a, b) => (a + Math.random() * (b - a)).toFixed(2);
  $('#ambient').innerHTML = Array.from({ length: 7 }, () =>
    `<span style="--x:${r(0, 100)}vw;--y:${r(5, 90)}vh;--d:-${r(0, 20)}s;--t:${r(14, 24)}s;--s:${r(0.6, 1.2)}"></span>`,
  ).join('');
}

/* ---------- sheets (search + detail) ---------- */

// Each open sheet gets a history entry, so Android's back gesture closes it.
function openSheet(dlg) {
  if (dlg.open) return;
  dlg.showModal();
  history.pushState({ sheet: dlg.id }, '');
}

function closeSheet(dlg) {
  if (!dlg.open || dlg.classList.contains('closing')) return;
  if (history.state?.sheet === dlg.id) history.back(); // popstate does the closing
  else animateClose(dlg);
}

function animateClose(dlg) {
  if (!dlg.open || dlg.classList.contains('closing')) return;
  const finish = () => {
    dlg.classList.remove('closing');
    dlg.style.transform = '';
    dlg.close();
  };
  if (reduceMotion()) return finish();
  dlg.classList.add('closing');
  setTimeout(finish, 220);
}

function enableSwipe(dlg) {
  let y0 = null;
  let dy = 0;
  dlg.addEventListener('pointerdown', (ev) => {
    if (!ev.target.closest('.grab')) return;
    y0 = ev.clientY;
    dy = 0;
    dlg.setPointerCapture(ev.pointerId);
    dlg.classList.add('dragging');
  });
  dlg.addEventListener('pointermove', (ev) => {
    if (y0 === null) return;
    dy = Math.max(0, ev.clientY - y0);
    dlg.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (y0 === null) return;
    y0 = null;
    dlg.classList.remove('dragging');
    if (dy > 100) closeSheet(dlg);
    else dlg.style.transform = '';
  };
  dlg.addEventListener('pointerup', end);
  dlg.addEventListener('pointercancel', end);
}

/* ---------- search ---------- */

function openSearch() {
  openSheet(searchDlg);
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
    box.innerHTML = '<div class="loading" aria-label="Searching"><span></span><span></span><span></span></div>';
  } else if (state === 'error') {
    box.innerHTML = '<p class="dim center">AniList is being shy right now. Try again in a moment.</p>';
  } else if (!lastResults.length) {
    box.innerHTML = '<p class="dim center">Nothing found. Try another spelling?</p>';
  } else {
    box.innerHTML = `<ul>${lastResults.map((r, i) => {
      const have = store.findByAnilist(r.anilist_id);
      const eps = r.total_eps ? `${r.total_eps} eps` : r.airing_status === 'RELEASING' ? 'airing' : '';
      return `<li class="result" style="--tint:${tintOf(r)};--i:${Math.min(i, 10)}">
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
  box.classList.toggle('fresh', state === 'done');
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

async function addFromSearch(i, status, rect) {
  const show = lastResults[i];
  if (!show || store.findByAnilist(show.anilist_id)) return;
  const pending = store.add(show, status);
  ui.view = 'list';
  ui.status = status;
  saveUi();
  render();
  renderResults('');
  buzz();
  burst(rect.left + rect.width / 2, rect.top + rect.height / 2, { count: 10, dist: 55, size: 15 });
  toast(`Added to ${STATUS_LABEL[status]} ✿`);
  if (!(await safe(pending))) renderResults('');
}

/* ---------- detail sheet ---------- */

function openDetail(id) {
  openId = id;
  editingTotal = false;
  renderDetail();
  if (searchDlg.open) {
    // Swap sheets in place so a single back press still closes the detail sheet.
    animateClose(searchDlg);
    if (history.state?.sheet === 'searchDlg') history.replaceState({ sheet: 'detailDlg' }, '');
    detailDlg.showModal();
  } else if (previewDlg.open) {
    animateClose(previewDlg);
    if (history.state?.sheet === 'previewDlg') history.replaceState({ sheet: 'detailDlg' }, '');
    detailDlg.showModal();
  } else {
    openSheet(detailDlg);
  }
}

function renderDetail() {
  if (!openId) return;
  const e = store.get(openId);
  if (!e) return;
  const total = totalOf(e);
  const next = nextOf(e);
  const hearts = Array.from({ length: 10 }, (_, k) => k + 1)
    .map((n) => `<button class="heart${n <= e.score ? ' on' : ''}" data-score="${n}" role="radio" aria-checked="${n === e.score}" aria-label="${n} out of 10">${HEART_SVG}</button>`)
    .join('');
  const notes = $('#dNotes');
  const draft = notes && notes.value !== e.notes ? notes.value : null; // keep unsaved typing
  detailDlg.style.setProperty('--tint', tintOf(e));
  detailDlg.innerHTML = `<div class="sheet detail" style="--tint:${tintOf(e)}">
    <div class="grab" aria-hidden="true"></div>
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
      ${editingTotal
        ? `<div class="stepper total-row">
             <input id="dTotal" type="number" inputmode="numeric" min="1" value="${total ?? ''}" aria-label="Total episodes" placeholder="total">
             <button class="pill" data-save-total>Save</button>
             <button class="link" data-cancel-total>Cancel</button>
           </div>`
        : `<button class="total-btn" data-edit-total>${total ? `${total} episodes in total` : 'Total episodes unknown'} · change</button>`}
    </section>
    <section class="d-sec"><h3>Rating <span class="dim">${e.score ? e.score + ' / 10' : 'not rated yet'}</span></h3>
      <div class="hearts" role="radiogroup" aria-label="Rating">${hearts}</div>
    </section>
    <section class="d-sec"><h3>Notes <span class="dim" id="savedLbl"></span></h3>
      <textarea id="dNotes" rows="3" placeholder="Favourite character, where you stopped, who recommended it…">${esc(draft ?? e.notes)}</textarea>
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

/* ---------- backup + app info sheet ---------- */

function renderSettings() {
  const count = store.all().length;
  $('#settingsBody').innerHTML = `
    <h2>Your shelf</h2>
    <p class="dim">${count} show${count === 1 ? '' : 's'} saved${store.cloudEnabled ? '' : ' on this device'}.</p>
    <section class="d-sec"><h3>Back up</h3>
      <p class="dim small">Copies your whole list as a code. Paste it into a note or a message to yourself to keep it safe, or to move it to another device.</p>
      <button class="pill" data-backup>Copy backup code</button>
      <textarea id="backupOut" rows="3" readonly hidden aria-label="Backup code"></textarea>
    </section>
    <section class="d-sec"><h3>Restore or move</h3>
      <p class="dim small">Paste a backup code from another device. New shows are added, and for shows on both, the most recent change wins. Nothing gets deleted.</p>
      <textarea id="restoreIn" rows="3" placeholder="Paste a backup code here…" aria-label="Backup code to restore"></textarea>
      <button class="pill soft" data-restore>Restore</button>
    </section>
    <section class="d-sec"><h3>App</h3>
      ${isApp
        ? `<p class="dim small">Version ${esc(appInfo?.version || '?')}</p>
           <button class="pill soft" data-check-update>Check for updates</button>
           <p class="dim small" id="updateMsg"></p>`
        : `<p class="dim small">On an Android phone? <a class="al-link" href="${APK_URL}">Get the Cozy Corner app</a></p>`}
    </section>`;
}

async function copyBackup() {
  const code = store.exportBackup();
  try {
    await navigator.clipboard.writeText(code);
    toast('Backup copied ✿ Paste it somewhere safe');
  } catch {
    // Clipboard blocked: show the code so it can be copied by hand.
    const out = $('#backupOut');
    out.hidden = false;
    out.value = code;
    out.select();
    toast('Select the code below and copy it');
  }
}

async function restoreBackup() {
  const text = $('#restoreIn').value.trim();
  if (!text) return toast('Paste a backup code first');
  try {
    const { added, updated } = await store.importBackup(text);
    $('#restoreIn').value = '';
    renderSettings();
    if (added || updated) celebrate();
    toast(added || updated ? `Restored ✿ ${added} added, ${updated} updated` : 'Everything was already up to date ✿');
  } catch (err) {
    toast(err instanceof SyntaxError || err.message === 'not a backup' ? "That doesn't look like a Cozy Corner backup code" : "Couldn't save that. Check your connection and try again.");
  }
}

// The app compares its installed build with version.json on the website.
async function checkForUpdate() {
  if (!isApp) return null;
  try {
    appInfo ??= await window.Capacitor.Plugins.App.getInfo();
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
    const v = await res.json();
    update = Number(v.versionCode) > Number(appInfo.build) ? v : null;
    try { localStorage.setItem('cc.updateChecked', String(Date.now())); } catch {}
    render();
  } catch (err) {
    console.warn('update check failed', err);
  }
  return update;
}

/* ---------- toast ---------- */

const toastEl = $('#toast');
let toastTimer;
function toast(msg, action, withMochi = false) {
  // Lives inside an open modal dialog so its button stays clickable.
  (document.querySelector('dialog[open]:not(.closing)') || document.body).appendChild(toastEl);
  toastEl.classList.remove('show');
  toastEl.innerHTML = `${withMochi ? mochi('wiggle') : ''}<span>${esc(msg)}</span>${action ? `<button class="toast-btn">${esc(action.label)}</button>` : ''}`;
  if (action) toastEl.querySelector('button').onclick = () => { toastEl.classList.remove('show'); action.fn(); };
  void toastEl.offsetWidth;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), action ? 6000 : 2600);
}

/* ---------- theme ---------- */

const darkScheme = matchMedia('(prefers-color-scheme: dark)');
const currentTheme = () => document.documentElement.dataset.theme || (darkScheme.matches ? 'dark' : 'light');

// In the Android app, keep the status bar icons readable against the current theme.
function syncSystemBars() {
  window.Capacitor?.Plugins?.SystemBars?.setStyle?.({ style: currentTheme() === 'dark' ? 'DARK' : 'LIGHT' })?.catch?.(() => {});
}
darkScheme.addEventListener('change', syncSystemBars);

function toggleTheme() {
  const t = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('cc.theme', t); } catch {}
  syncSystemBars();
  $('#themeBtn').classList.remove('spin');
  void $('#themeBtn').offsetWidth;
  $('#themeBtn').classList.add('spin');
}

/* ---------- events ---------- */

let removeArmed = null;
let signOutArmed = false;

document.addEventListener('click', (ev) => {
  const dlg = ev.target.closest('dialog');
  if (dlg && ev.target === dlg) return closeSheet(dlg); // backdrop tap
  // Inside the app, links to other sites must open in the phone's browser.
  const link = ev.target.closest('a[href^="http"]');
  if (link && isApp) {
    ev.preventDefault();
    location.href = link.href;
    return;
  }
  const t = ev.target.closest('button');
  if (!t) return;
  const d = t.dataset;

  if (d.view) {
    if (d.view === ui.view) return;
    if (d.view === 'list') {
      if (history.state?.view) return history.back(); // popstate switches back
    } else {
      history.pushState({ view: d.view }, '');
    }
    ui.view = d.view; saveUi(); render(true); scrollTo(0, 0);
  } else if (d.action === 'search') {
    openSearch();
  } else if ('recRefresh' in d) {
    toast('Looking for fresh picks ✿');
    loadRecs({ force: true });
  } else if (d.preview) {
    openPreview(Number(d.preview));
  } else if (d.addrec) {
    addRecommended(d.addrec);
  } else if ('editTotal' in d) {
    editingTotal = true;
    renderDetail();
    $('#dTotal')?.focus();
    $('#dTotal')?.select?.();
  } else if ('saveTotal' in d) {
    const raw = $('#dTotal').value.trim();
    const n = raw === '' ? null : Math.max(1, parseInt(raw, 10) || 0) || null;
    editingTotal = false;
    change(openId, { total_eps: n });
    toast(n ? `Total set to ${n} episodes ✿` : "Using AniList's episode count");
  } else if ('cancelTotal' in d) {
    editingTotal = false;
    renderDetail();
  } else if (d.statusTab) {
    if (d.statusTab === ui.status) return;
    ui.status = d.statusTab; saveUi(); render(true); revealActiveChip();
  } else if (d.kind) {
    if (d.kind === ui.kind) return;
    ui.kind = d.kind; render(true);
  } else if (d.plus) {
    const e = store.get(d.plus);
    const total = totalOf(e);
    if (total && e.progress >= total) toast('Already at the last episode ✿');
    else setProgress(d.plus, e.progress + 1, t.getBoundingClientRect());
  } else if (d.open) {
    openDetail(d.open);
  } else if (d.suggest) {
    $('#q').value = d.suggest; onSearchInput();
  } else if (d.add) {
    addFromSearch(Number(d.add), d.as, t.getBoundingClientRect());
  } else if (d.setStatus) {
    setStatus(openId, d.setStatus);
  } else if (d.step) {
    setProgress(openId, store.get(openId).progress + Number(d.step));
  } else if (d.score) {
    const n = Number(d.score);
    const rect = t.getBoundingClientRect();
    const score = store.get(openId).score === n ? 0 : n;
    change(openId, { score });
    if (score) heartsRipple(score, rect);
  } else if ('remove' in d) {
    if (removeArmed !== openId) {
      removeArmed = openId;
      t.textContent = 'Tap again to remove';
      t.classList.add('armed');
      setTimeout(() => { removeArmed = null; t.textContent = 'Remove from list'; t.classList.remove('armed'); }, 3000);
    } else {
      const title = store.get(openId).title;
      safe(store.remove(openId));
      closeSheet(detailDlg);
      toast(`Removed ${title}`);
    }
  } else if ('close' in d) {
    closeSheet(t.closest('dialog'));
  } else if ('hideUpdate' in d) {
    try { localStorage.setItem('cc.updateDismissed', String(update?.versionCode)); } catch {}
    t.closest('.update-card').remove();
  } else if ('backup' in d) {
    copyBackup();
  } else if ('restore' in d) {
    restoreBackup();
  } else if ('checkUpdate' in d) {
    $('#updateMsg').textContent = 'Checking…';
    checkForUpdate().then((u) => {
      const msg = $('#updateMsg');
      if (msg) msg.textContent = u ? `Version ${u.versionName} is ready: tap Update on your shelf ✿` : "You're on the newest version ✿";
    });
  } else if (t.id === 'settingsBtn') {
    renderSettings();
    openSheet(settingsDlg);
  } else if ('hidePromo' in d) {
    try { localStorage.setItem('cc.appPromo', 'hidden'); } catch {}
    t.closest('.app-promo').remove();
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
  if (ev.target.id === 'sortSel') { ui.sort = ev.target.value; saveUi(); render(true); }
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

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target.id === 'dTotal') {
    ev.preventDefault();
    $('[data-save-total]')?.click();
  }
});

// Animations end by removing their trigger class, so they can play again next time.
document.addEventListener('animationend', (ev) => {
  ev.target.classList?.remove('squish', 'flip', 'pop', 'ripple', 'spin');
});

for (const dlg of [searchDlg, detailDlg, settingsDlg, previewDlg]) {
  dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); closeSheet(dlg); }); // Esc key
  enableSwipe(dlg);
}
detailDlg.addEventListener('close', () => { flushNotes(); openId = null; editingTotal = false; });
previewDlg.addEventListener('close', () => { previewId = null; });

addEventListener('popstate', () => {
  const open = document.querySelector('dialog[open]:not(.closing)');
  if (open) return animateClose(open);
  if (ui.view !== 'list' && history.state?.view !== ui.view) {
    ui.view = 'list'; saveUi(); render(true); scrollTo(0, 0);
  }
});

setInterval(() => {
  document.querySelectorAll('[data-cd]').forEach((el) => { el.textContent = countdown(Number(el.dataset.cd)); });
}, 30000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  loadAiring();
  let last = 0;
  try { last = Number(localStorage.getItem('cc.updateChecked')) || 0; } catch {}
  if (Date.now() - last > 6 * 3600 * 1000) checkForUpdate();
});

/* ---------- login ---------- */

function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
  hideSplash();
  const err = $('#loginErr');
  let email = '';
  // Supabase sends people back with #error=... when a link is expired or already used.
  const back = new URLSearchParams(location.hash.slice(1));
  if (back.get('error')) {
    err.textContent = back.get('error_code') === 'otp_expired'
      ? 'That sign-in link has expired or was already used. Send yourself a new one ✿'
      : 'That sign-in link didn’t work. Send yourself a new one ✿';
    history.replaceState(null, '', location.pathname);
  }
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
      if (isApp) $('#codeHint').textContent = 'Open the email on this phone and tap the link: it brings you straight back here, signed in. Or type the 6-digit code from the email below.';
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
  if (isApp) {
    // Tapping the email link on the phone reopens the app with the sign-in details.
    let done = false;
    const fromLink = async (url) => {
      if (done || !url?.startsWith('com.desolatemartial.cozycorner://')) return;
      try {
        await store.signInFromLink(url);
        done = true;
        showApp('cloud');
      } catch (e) {
        err.textContent = e.message === 'otp_expired'
          ? 'That sign-in link has expired or was already used. Send yourself a new one ✿'
          : 'That sign-in link didn’t work. Send yourself a new one ✿';
      }
    };
    const App = window.Capacitor.Plugins.App;
    App.addListener('appUrlOpen', ({ url }) => fromLink(url));
    App.getLaunchUrl?.().then((r) => fromLink(r?.url)).catch(() => {});
  }
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
    if (ui.view === 'foryou') loadRecs();
  });
  if (ui.view !== 'list') history.pushState({ view: ui.view }, '');
  render(true);
  hideSplash();
  loadAiring();
  checkForUpdate();
}

async function boot() {
  document.querySelectorAll('[data-subtitle]').forEach((el) => { el.textContent = SUBTITLE; });
  if (isApp) {
    document.documentElement.classList.add('is-app');
    syncSystemBars();
    // Android back: close the open sheet / leave Airing first, only then leave the app.
    window.Capacitor.Plugins.App?.addListener('backButton', () => {
      if (history.state?.sheet || history.state?.view) history.back();
      else window.Capacitor.Plugins.App.minimizeApp();
    });
  }
  ambient();
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

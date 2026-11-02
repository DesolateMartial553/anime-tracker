import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
const LOCAL_KEY = 'cc.local.v1';
// Email links opened on the phone come back into the Android app through this address.
const APP_REDIRECT = 'com.desolatemartial.cozycorner://login';
const COLUMNS = ['id', 'user_id', 'anilist_id', 'title', 'title_native', 'cover_url', 'cover_color',
  'total_eps', 'format', 'country', 'year', 'status', 'progress', 'score', 'notes', 'created_at', 'updated_at'];

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let sb = null;
let user = null;
let entries = [];
const listeners = new Set();
const syncListeners = new Set();

// Live sync state: 'synced' when the list matches the server, 'syncing' while a
// round trip is in flight, 'offline' when writes are queued or the live link dropped.
let sync = 'synced';
let syncedAt = 0; // ms timestamp of the last successful round trip
let channel = null;
let channelReady = false;

const readLS = (k, fallback) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const cacheKey = () => (user ? 'cc.cache.' + user.id : LOCAL_KEY);
const pick = (o) => Object.fromEntries(COLUMNS.filter((c) => c in o).map((c) => [c, o[c]]));

const queueKey = () => (user ? 'cc.queue.' + user.id : null);
const getQueue = () => (queueKey() ? readLS(queueKey(), []) : []);
const setQueue = (q) => { if (queueKey()) writeLS(queueKey(), q); };
export const pendingCount = () => getQueue().length;

/* ---------- live sync state ---------- */

export const syncState = () => sync;
export const lastSyncedAt = () => syncedAt;
export const subscribeSync = (fn) => syncListeners.add(fn);

function setSync(next, at) {
  const changed = next !== sync || Boolean(at && at !== syncedAt);
  sync = next;
  if (at) syncedAt = at;
  if (changed) syncListeners.forEach((fn) => { try { fn(); } catch {} });
}

const markSynced = () => setSync('synced', Date.now());
// A queued change means the server doesn't have it yet: keep saying so.
const settleSync = () => (pendingCount() ? setSync('offline') : markSynced());

function enqueue(op) {
  const q = getQueue();
  q.push(op);
  setQueue(q);
}

export async function flushQueue() {
  if (!sb || !user) return;
  if (!navigator.onLine) {
    setSync('offline');
    return;
  }
  const q = getQueue();
  const hadPending = q.length > 0;
  if (hadPending) setSync('syncing');
  // Replay queued writes; drop non-network errors and continue; stop on network error.
  while (q.length) {
    const item = q[0];
    try {
      let res;
      if (item.op === 'add') res = await sb.from('entries').upsert(item.row, { onConflict: 'id' });
      else if (item.op === 'update') res = await sb.from('entries').update(pick(item.patch)).eq('id', item.id);
      else if (item.op === 'remove') res = await sb.from('entries').delete().eq('id', item.id);
      
      if (res.error) {
        if (isNetworkError(res.error)) break;
        console.warn('Queue item failed, dropping:', item, res.error);
        q.shift();
        setQueue(q);
      } else {
        q.shift();
        setQueue(q);
      }
    } catch (err) {
      if (isNetworkError(err)) break;
      console.warn('Queue item threw, dropping:', item, err);
      q.shift();
      setQueue(q);
    }
  }
  emit();
  if (hadPending) settleSync();
}

function emit() {
  writeLS(cacheKey(), entries);
  listeners.forEach((fn) => fn(entries));
}

export const subscribe = (fn) => listeners.add(fn);
export const all = () => entries;
export const get = (id) => entries.find((e) => e.id === id);
export const findByAnilist = (aid) => entries.find((e) => e.anilist_id === aid);
export const currentUser = () => user;

export async function init() {
  if (!cloudEnabled) {
    entries = readLS(LOCAL_KEY, []);
    return 'local';
  }
  const { createClient } = await import(SUPABASE_ESM);
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { flowType: 'implicit', persistSession: true, detectSessionInUrl: true },
  });
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return 'login';
  await startCloud(session.user);
  return 'cloud';
}

async function startCloud(u) {
  user = u;
  entries = readLS(cacheKey(), []);
  emit();
  // Show the cached list straight away; the server copy replaces it when it arrives.
  migrateLocal().then(refresh).catch((err) => {
    console.warn('sync failed', err);
    setSync('offline');
  }).finally(() => startRealtime());

  const handleSync = (ev) => {
    if (ev?.type === 'offline') {
      setSync('offline');
      return;
    }
    if (ev?.type === 'online') setSync('syncing');
    if (ev?.type === 'online' || document.visibilityState === 'visible') {
      flushQueue().then(refresh).catch(() => {});
    }
  };
  document.addEventListener('visibilitychange', handleSync);
  window.addEventListener('online', handleSync);
  window.addEventListener('offline', handleSync);
  
  flushQueue().catch(() => {});
}

/* ---------- Supabase Realtime: another device's edits arrive without a reload ---------- */

function startRealtime() {
  if (!sb || !user) return;
  if (channel) {
    try { sb.removeChannel(channel); } catch {}
    channel = null;
  }
  channelReady = false;
  channel = sb.channel('entries:' + user.id).on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'entries', filter: 'user_id=eq.' + user.id },
    onRealtimeChange,
  );
  channel.subscribe(onRealtimeStatus);
}

function onRealtimeStatus(status) {
  if (status === 'SUBSCRIBED') {
    // After a drop, catch up on anything that happened while we were away.
    if (channelReady) flushQueue().then(refresh).catch(() => {});
    channelReady = true;
    if (!pendingCount()) markSynced();
  } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
    // Realtime is down; writes still queue, and supabase-js reconnects by itself.
    setSync('offline');
  }
}

// Timestamps come in three shapes: browser ISO ('…T……Z'), PostgREST ('…T…+00:00') and
// Postgres text ('...  ...+00' — space, no T). Compare them as times, never as strings.
const ts = (v) => {
  let s = String(v || '').replace(' ', 'T');
  if (/[+-][0-9]{2}$/.test(s)) s += ':00'; // short Postgres offset like +00
  const n = Date.parse(s);
  return Number.isNaN(n) ? 0 : n;
};

// Our own writes echo back here too — the updated_at comparison makes that a no-op.
function onRealtimeChange({ eventType, new: row, old } = {}) {
  if (eventType === 'DELETE') {
    if (!old?.id) return;
    const before = entries.length;
    entries = entries.filter((e) => e.id !== old.id);
    if (entries.length === before) return;
    emit();
    if (!pendingCount()) markSynced();
    return;
  }
  if (!row?.id) return;
  // A change still waiting in the offline queue is newer than this row: leave it be.
  const queued = getQueue().some((item) => item.id === row.id || item.row?.id === row.id);
  if (queued) return;
  const i = entries.findIndex((e) => e.id === row.id);
  if (i === -1) {
    entries = [pick(row), ...entries];
  } else {
    if (ts(row.updated_at) <= ts(entries[i].updated_at)) return;
    entries = entries.map((e, j) => (j === i ? pick(row) : e));
  }
  emit();
  if (!pendingCount()) markSynced();
}

// Anything saved before syncing was set up gets uploaded on first sign-in.
async function migrateLocal() {
  const local = readLS(LOCAL_KEY, []);
  if (!local.length) return;
  const rows = local.map((e) => pick({ ...e, user_id: user.id }));
  const { error } = await sb.from('entries').upsert(rows, { onConflict: 'user_id,anilist_id', ignoreDuplicates: true });
  if (!error) localStorage.removeItem(LOCAL_KEY);
}

export async function refresh() {
  if (!sb || !user) return;
  setSync('syncing');
  const { data, error } = await sb.from('entries').select('*').order('updated_at', { ascending: false });
  if (error) {
    setSync('offline');
    throw error;
  }
  entries = data;
  // Apply queued patches on top of server rows so locally-queued changes aren't lost
  const q = getQueue();
  for (const item of q) {
    if (item.op === 'add') {
      if (!entries.find((e) => e.id === item.row.id)) entries = [item.row, ...entries];
    } else if (item.op === 'update') {
      entries = entries.map((e) => (e.id === item.id ? { ...e, ...item.patch } : e));
    } else if (item.op === 'remove') {
      entries = entries.filter((e) => e.id !== item.id);
    }
  }
  emit();
  settleSync();
}

function isNetworkError(err) {
  return (err instanceof TypeError) || (typeof navigator !== 'undefined' && navigator.onLine === false) || (err?.message && /fetch|network|Failed to fetch/i.test(err.message));
}

export async function add(show, status) {
  const now = new Date().toISOString();
  const row = pick({
    ...show,
    id: crypto.randomUUID(),
    status,
    progress: 0,
    score: 0,
    notes: '',
    created_at: now,
    updated_at: now,
  });
  if (user) row.user_id = user.id;
  entries = [row, ...entries];
  emit();
  if (sb && user) {
    const was = sync;
    setSync('syncing');
    try {
      const { error } = await sb.from('entries').insert(row);
      if (error) {
        if (isNetworkError(error)) {
          enqueue({ op: 'add', row });
          setSync('offline');
          return row;
        }
        entries = entries.filter((e) => e.id !== row.id);
        emit();
        setSync(was);
        throw error;
      }
      settleSync();
    } catch (err) {
      if (isNetworkError(err)) {
        enqueue({ op: 'add', row });
        setSync('offline');
        return row;
      }
      entries = entries.filter((e) => e.id !== row.id);
      emit();
      setSync(was);
      throw err;
    }
  }
  return row;
}

export async function update(id, patch) {
  const prev = get(id);
  if (!prev) return;
  const next = { ...prev, ...patch, updated_at: new Date().toISOString() };
  entries = entries.map((e) => (e.id === id ? next : e));
  emit();
  if (sb && user) {
    const was = sync;
    setSync('syncing');
    try {
      const { error } = await sb.from('entries').update(pick({ ...patch, updated_at: next.updated_at })).eq('id', id);
      if (error) {
        if (isNetworkError(error)) {
          enqueue({ op: 'update', id, patch: { ...patch, updated_at: next.updated_at } });
          setSync('offline');
          return;
        }
        entries = entries.map((e) => (e.id === id ? prev : e));
        emit();
        setSync(was);
        throw error;
      }
      settleSync();
    } catch (err) {
      if (isNetworkError(err)) {
        enqueue({ op: 'update', id, patch: { ...patch, updated_at: next.updated_at } });
        setSync('offline');
        return;
      }
      entries = entries.map((e) => (e.id === id ? prev : e));
      emit();
      setSync(was);
      throw err;
    }
  }
}

export async function remove(id) {
  const prev = entries;
  entries = entries.filter((e) => e.id !== id);
  emit();
  if (sb && user) {
    const was = sync;
    setSync('syncing');
    try {
      const { error } = await sb.from('entries').delete().eq('id', id);
      if (error) {
        if (isNetworkError(error)) {
          enqueue({ op: 'remove', id });
          setSync('offline');
          return;
        }
        entries = prev;
        emit();
        setSync(was);
        throw error;
      }
      settleSync();
    } catch (err) {
      if (isNetworkError(err)) {
        enqueue({ op: 'remove', id });
        setSync('offline');
        return;
      }
      entries = prev;
      emit();
      setSync(was);
      throw err;
    }
  }
}

const STATUSES = ['watching', 'planning', 'completed', 'paused', 'dropped'];

// Backup code = the list without ids, so it can be restored on any device or account.
export function exportBackup() {
  const shows = entries.map(({ id, user_id, ...rest }) => rest);
  return JSON.stringify({ app: 'cozy-corner', v: 1, exported: new Date().toISOString(), shows });
}

// Merges a backup in: new shows are added; for shows on both sides the newer edit wins.
export async function importBackup(text) {
  const data = JSON.parse(text);
  if (data?.app !== 'cozy-corner' || !Array.isArray(data.shows)) throw new Error('not a backup');
  const byShow = new Map(entries.map((e) => [e.anilist_id, e]));
  const changed = [];
  let added = 0, updated = 0;
  for (const s of data.shows) {
    if (!s || !Number.isInteger(s.anilist_id) || typeof s.title !== 'string') continue;
    if (!STATUSES.includes(s.status)) s.status = 'planning';
    const have = byShow.get(s.anilist_id);
    if (!have) {
      const row = pick({ progress: 0, score: 0, notes: '', ...s, id: crypto.randomUUID() });
      if (user) row.user_id = user.id;
      byShow.set(s.anilist_id, row);
      changed.push(row);
      added++;
    } else if (ts(s.updated_at) > ts(have.updated_at)) {
      const row = pick({ ...have, ...s, id: have.id, user_id: have.user_id });
      byShow.set(s.anilist_id, row);
      changed.push(row);
      updated++;
    }
  }
  entries = [...byShow.values()];
  emit();
  if (sb && user && changed.length) {
    const { error } = await sb.from('entries').upsert(changed, { onConflict: 'id' });
    if (error) {
      await refresh().catch(() => {});
      throw error;
    }
  }
  return { added, updated };
}

export async function sendLoginEmail(email) {
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.Capacitor?.isNativePlatform?.() ? APP_REDIRECT : location.origin + location.pathname },
  });
  if (error) throw error;
}

// The Android app receives the email link as com.desolatemartial.cozycorner://login#access_token=…
export async function signInFromLink(url) {
  const params = new URLSearchParams((url.split('#')[1] || url.split('?')[1] || ''));
  if (params.get('error')) throw new Error(params.get('error_code') || 'link_error');
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) throw new Error('link_error');
  const { data, error } = await sb.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
  await startCloud(data.user);
}

// For the home-screen app: she can type the 6-digit code instead of tapping the link.
export async function verifyCode(email, token) {
  const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  await startCloud(data.user);
}

export async function coupleInvite() {
  if (!sb || !user) return;
  const { data, error } = await sb.from('couples').insert({ a: user.id, b: null }).select().single();
  if (error) throw error;
  return data.code;
}
export async function coupleAccept(code) {
  if (!sb || !user) return;
  const { data, error: selectError } = await sb.from('couples').select('*').eq('code', code.toUpperCase()).single();
  if (selectError) throw selectError;
  if (!data || data.b) throw new Error('bad or used code');
  const { error: updateError } = await sb.from('couples').update({ b: user.id }).eq('a', data.a);
  if (updateError) throw updateError;
}

export async function signOut() {
  if (sb) await sb.auth.signOut();
  location.reload();
}

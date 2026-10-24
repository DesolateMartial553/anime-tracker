import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
const LOCAL_KEY = 'cc.local.v1';
const COLUMNS = ['id', 'user_id', 'anilist_id', 'title', 'title_native', 'cover_url', 'cover_color',
  'total_eps', 'format', 'country', 'year', 'status', 'progress', 'score', 'notes', 'created_at', 'updated_at'];

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let sb = null;
let user = null;
let entries = [];
const listeners = new Set();

const readLS = (k, fallback) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const cacheKey = () => (user ? 'cc.cache.' + user.id : LOCAL_KEY);
const pick = (o) => Object.fromEntries(COLUMNS.filter((c) => c in o).map((c) => [c, o[c]]));

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
  migrateLocal().then(refresh).catch((err) => console.warn('sync failed', err));
  // Pick up changes made on her other device when she comes back to the app.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh().catch(() => {});
  });
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
  const { data, error } = await sb.from('entries').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  entries = data;
  emit();
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
    const { error } = await sb.from('entries').insert(row);
    if (error) {
      entries = entries.filter((e) => e.id !== row.id);
      emit();
      throw error;
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
    const { error } = await sb.from('entries').update(pick({ ...patch, updated_at: next.updated_at })).eq('id', id);
    if (error) {
      entries = entries.map((e) => (e.id === id ? prev : e));
      emit();
      throw error;
    }
  }
}

export async function remove(id) {
  const prev = entries;
  entries = entries.filter((e) => e.id !== id);
  emit();
  if (sb && user) {
    const { error } = await sb.from('entries').delete().eq('id', id);
    if (error) {
      entries = prev;
      emit();
      throw error;
    }
  }
}

export async function sendLoginEmail(email) {
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw error;
}

// For the home-screen app: she can type the 6-digit code instead of tapping the link.
export async function verifyCode(email, token) {
  const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  await startCloud(data.user);
}

export async function signOut() {
  if (sb) await sb.auth.signOut();
  location.reload();
}

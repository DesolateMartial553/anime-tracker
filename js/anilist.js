const API = 'https://graphql.anilist.co';
const AIR_KEY = 'cc.airing.v1';
const AIR_TTL = 30 * 60 * 1000;

async function gql(query, variables, signal) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  if (!res.ok) throw new Error('AniList ' + res.status);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

const SEARCH = `query ($q: String) {
  Page(perPage: 12) {
    media(search: $q, type: ANIME, sort: SEARCH_MATCH, isAdult: false) {
      id title { romaji english native } coverImage { large color }
      episodes format status seasonYear countryOfOrigin
    }
  }
}`;

const AIRING = `query ($ids: [Int]) {
  Page(perPage: 50) {
    media(id_in: $ids) { id episodes status nextAiringEpisode { episode airingAt } }
  }
}`;

export async function searchAnime(q, signal) {
  const data = await gql(SEARCH, { q }, signal);
  return data.Page.media.map((m) => ({
    anilist_id: m.id,
    title: m.title.english || m.title.romaji,
    title_native: m.title.native,
    cover_url: m.coverImage.large,
    cover_color: m.coverImage.color,
    total_eps: m.episodes,
    format: m.format,
    country: m.countryOfOrigin,
    year: m.seasonYear,
    airing_status: m.status,
  }));
}

function readCache() {
  try { return JSON.parse(localStorage.getItem(AIR_KEY)) || { at: 0, data: {} }; }
  catch { return { at: 0, data: {} }; }
}

// Returns { [anilistId]: { status, episodes, next: { episode, airingAt } | null } }.
// One request per 50 shows, cached for 30 minutes or until a cached episode has aired.
export async function getAiring(ids) {
  const cache = readCache();
  const now = Date.now() / 1000;
  const fresh =
    Date.now() - cache.at < AIR_TTL &&
    ids.every((id) => id in cache.data) &&
    !Object.values(cache.data).some((d) => d.next && d.next.airingAt < now);
  if (fresh || !ids.length) return cache.data;

  const data = {};
  for (let i = 0; i < ids.length; i += 50) {
    const res = await gql(AIRING, { ids: ids.slice(i, i + 50) });
    for (const m of res.Page.media) {
      data[m.id] = { status: m.status, episodes: m.episodes, next: m.nextAiringEpisode };
    }
  }
  try { localStorage.setItem(AIR_KEY, JSON.stringify({ at: Date.now(), data })); } catch {}
  return data;
}

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
  Page(perPage: 24) {
    media(search: $q, type: ANIME, sort: [POPULARITY_DESC, SEARCH_MATCH], isAdult: false) {
      id title { romaji english native } coverImage { large color }
      episodes format status seasonYear countryOfOrigin description averageScore genres
    }
  }
}`;

const AIRING = `query ($ids: [Int]) {
  Page(perPage: 50) {
    media(id_in: $ids) { id episodes status nextAiringEpisode { episode airingAt } }
  }
}`;

// Fields shared by recommendations and the "similar shows" fallback.
const MEDIA = `id title { english romaji } coverImage { large } episodes seasonYear status`;

// AniList's own "if you liked this, you might like" graph, ranked by how many
// people agreed with each recommendation.
const RECS = `query ($ids: [Int]) {
  Page(perPage: 50) {
    media(id_in: $ids) {
      id countryOfOrigin genres tags { name rank }
      recommendations(sort: RATING_DESC, perPage: 10) {
        nodes { rating mediaRecommendation { ${MEDIA} } }
      }
    }
  }
}`;

// Fallback for shows with few recommendations: popular shows sharing its tags/genres.
const SIMILAR = `query ($tags: [String], $genres: [String], $country: CountryCode, $exclude: [Int]) {
  Page(perPage: 12) {
    media(type: ANIME, isAdult: false, sort: POPULARITY_DESC, tag_in: $tags,
          genre_in: $genres, countryOfOrigin: $country, id_not_in: $exclude) { ${MEDIA} }
  }
}`;

export async function searchAnime(q, signal) {
  const data = await gql(SEARCH, { q }, signal);
  return data.Page.media.map((m) => {
    const genreTags = Array.isArray(m.genres) ? m.genres : [];
    return {
      anilist_id: m.id,
      title: m.title.english || m.title.romaji || m.title.native,
      title_native: m.title.native,
      cover_url: m.coverImage?.large,
      cover_color: m.coverImage?.color,
      total_eps: m.episodes,
      format: m.format,
      country: m.countryOfOrigin,
      year: m.seasonYear,
      airing_status: m.status,
      description: plain(m.description),
      community: m.averageScore,
      genres: (Array.isArray(m.genres) ? m.genres : []).slice(0, 4),
    };
  });
}

// AniList descriptions are light HTML; keep the words, drop the markup.
const plain = (s) => String(s ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const toShow = (m) => ({
  anilist_id: m.id,
  title: m.title.english || m.title.romaji || m.title.native,
  title_native: m.title.native,
  cover_url: m.coverImage?.large,
  cover_color: m.coverImage?.color,
  total_eps: m.episodes,
  format: m.format,
  country: m.countryOfOrigin,
  year: m.seasonYear,
  airing_status: m.status,
  description: plain(m.description),
  community: m.averageScore,
});

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

/* ---------- "For you" ---------- */

const REC_KEY = 'cc.recs.v2';
const REC_TTL = 6 * 60 * 60 * 1000;

const readRecCache = () => {
  try { return JSON.parse(localStorage.getItem(REC_KEY)) || { at: 0, key: '', data: [] }; }
  catch { return { at: 0, key: '', data: [] }; }
};

// Popular shows that look like the one she's watching, used when AniList has
// few recommendations for it (common for donghua).
async function similarTo(media, exclude) {
  // Two tags plus one genre: specific enough to feel related, loose enough to
  // return anything at all (all four tags at once matched only three shows).
  const tags = (media.tags || []).filter((t) => t.rank >= 60).slice(0, 2).map((t) => t.name);
  const genres = (media.genres || []).slice(0, 1);
  const vars = { exclude };
  if (tags.length) vars.tags = tags;
  if (genres.length) vars.genres = genres;
  if (media.countryOfOrigin) vars.country = media.countryOfOrigin;
  const data = await gql(SIMILAR, vars);
  return data.Page.media.map(toShow);
}

/**
 * Builds "Because you're watching X" rows from her shelf.
 * @param {{anilist_id:number,title:string,status:string,country?:string}[]} sources
 * @returns {Promise<{id:number,title:string,status:string,items:object[]}[]>}
 */
export async function getRecommendations(sources) {
  const key = sources.map((s) => `${s.anilist_id}:${s.status}`).join(',');
  const cache = readRecCache();
  if (cache.key === key && cache.data.length && Date.now() - cache.at < REC_TTL) return cache.data;

  const ids = sources.map((s) => s.anilist_id);
  const data = await gql(RECS, { ids });
  const byId = new Map(data.Page.media.map((m) => [m.id, m]));

  const seen = new Set(ids); // never suggest something already on her shelf
  const sections = [];
  let fallbacks = 0;

  for (const src of sources) {
    const media = byId.get(src.anilist_id);
    if (!media) continue;
    const items = [];
    const take = (show) => {
      if (!show?.anilist_id || seen.has(show.anilist_id) || !show.cover_url) return;
      seen.add(show.anilist_id);
      items.push(show);
    };

    for (const node of media.recommendations?.nodes || []) {
      if (items.length >= 8) break;
      if (node.mediaRecommendation) take(toShow(node.mediaRecommendation));
    }
    if (items.length < 3 && fallbacks < 3) {
      fallbacks++;
      try {
        for (const show of await similarTo(media, [...seen])) {
          if (items.length >= 8) break;
          take(show);
        }
      } catch (err) {
        console.warn('similar lookup failed', err);
      }
    }
    if (items.length >= 2) sections.push({ id: src.anilist_id, title: src.title, status: src.status, items });
  }

  try { localStorage.setItem(REC_KEY, JSON.stringify({ at: Date.now(), key, data: sections })); } catch {}
  return sections;
}

export function clearRecommendationCache() {
  try { localStorage.removeItem(REC_KEY); } catch {}
}


/* ---------- Explore ---------- */

const EXPLORE_KEY = 'cc.explore.v1';
const EXPLORE_TTL = 6 * 60 * 60 * 1000;
const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];

// AniList counts December as the winter of the following year. `shift` steps whole seasons ahead.
export function seasonOf(date = new Date(), shift = 0) {
  const m = date.getMonth();
  const idx = m === 11 ? 0 : Math.floor((m + 1) / 3);
  const n = (date.getFullYear() + (m === 11 ? 1 : 0)) * 4 + idx + shift;
  return { season: SEASONS[n % 4], year: Math.floor(n / 4) };
}

// Both queries were run against the live API before they were wired in (the old Explore died on a bad field).
const SHOW_FIELDS = `fragment F on Media { id title { english romaji native } coverImage { large color } episodes format
  seasonYear status countryOfOrigin averageScore genres description(asHtml: false) nextAiringEpisode { episode airingAt } }`;

const EXPLORE = `query ($s: MediaSeason, $y: Int, $ns: MediaSeason, $ny: Int) {
  trending: Page(perPage: 16) { media(type: ANIME, isAdult: false, sort: TRENDING_DESC) { ...F } }
  season: Page(perPage: 16) { media(type: ANIME, isAdult: false, season: $s, seasonYear: $y, sort: POPULARITY_DESC) { ...F } }
  upcoming: Page(perPage: 16) { media(type: ANIME, isAdult: false, season: $ns, seasonYear: $ny, sort: POPULARITY_DESC) { ...F } }
  top: Page(perPage: 16) { media(type: ANIME, isAdult: false, sort: SCORE_DESC) { ...F } }
  donghua: Page(perPage: 16) { media(type: ANIME, isAdult: false, countryOfOrigin: CN, sort: TRENDING_DESC) { ...F } }
  GenreCollection
}
${SHOW_FIELDS}`;

const BROWSE = `query ($page: Int, $sort: [MediaSort], $season: MediaSeason, $year: Int, $country: CountryCode, $genre: String) {
  Page(page: $page, perPage: 30) {
    pageInfo { hasNextPage }
    media(type: ANIME, isAdult: false, sort: $sort, season: $season, seasonYear: $year, countryOfOrigin: $country, genre: $genre) { ...F }
  }
}
${SHOW_FIELDS}`;

const BROWSE_KINDS = {
  trending: { sort: ['TRENDING_DESC'] },
  season: { sort: ['POPULARITY_DESC'], shift: 0 },
  upcoming: { sort: ['POPULARITY_DESC'], shift: 1 },
  top: { sort: ['SCORE_DESC'] },
  donghua: { sort: ['TRENDING_DESC'], country: 'CN' },
  genre: { sort: ['POPULARITY_DESC'] },
};

const toExploreShow = (m) => ({ ...toShow(m), genres: (m.genres || []).slice(0, 4), next: m.nextAiringEpisode });
const withCover = (list) => list.map(toExploreShow).filter((s) => s.cover_url);

// { shelves: { trending, season, upcoming, top, donghua }, genres }, cached for 6 hours per season.
export async function getExplore({ force = false } = {}) {
  const cur = seasonOf();
  const next = seasonOf(new Date(), 1);
  const key = `${cur.season}${cur.year}`;
  try {
    const c = JSON.parse(localStorage.getItem(EXPLORE_KEY));
    if (!force && c?.key === key && Date.now() - c.at < EXPLORE_TTL) return c.data;
  } catch {}
  const d = await gql(EXPLORE, { s: cur.season, y: cur.year, ns: next.season, ny: next.year });
  const data = {
    shelves: Object.fromEntries(['trending', 'season', 'upcoming', 'top', 'donghua'].map((k) => [k, withCover(d[k].media)])),
    genres: d.GenreCollection.filter((g) => g !== 'Hentai'),
  };
  try { localStorage.setItem(EXPLORE_KEY, JSON.stringify({ at: Date.now(), key, data })); } catch {}
  return data;
}

// One page of a "See all" grid.
export async function getBrowse({ kind, genre = null, country = null, page = 1 }) {
  const k = BROWSE_KINDS[kind] || BROWSE_KINDS.trending;
  // AniList reads an explicit null filter as "match nothing", so unset filters must be left out entirely.
  const vars = { page, sort: k.sort };
  if (genre) vars.genre = genre;
  if (country || k.country) vars.country = country || k.country;
  if ('shift' in k) Object.assign(vars, seasonOf(new Date(), k.shift));
  const d = await gql(BROWSE, vars);
  return { items: withCover(d.Page.media), hasNext: d.Page.pageInfo.hasNextPage };
}

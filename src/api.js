// The CineBlock web API, as the terminal sees it. Hides HTTP, timeouts, error
// mapping and response shapes behind a handful of calls that return plain
// movie objects or throw a CliError.
//
// Endpoints used (all on www.cineblock.in, see the movieX repo):
//   GET  /api/cli            check the cb_ token, read today's quota (free)
//   POST /api/cli            spend one search from today's quota
//   GET  /api/cli/library    read watchlist / liked / watched (free, rate limited)
//   POST /api/find-movie     guided search, five server-ranked results
//   GET  /api/movies         title lookup used to verify AI suggestions
import { CliError } from './errors.js';

export const DEFAULT_BASE_URL = 'https://www.cineblock.in';
export const CLI_TOKEN_PATTERN = /^cb_[0-9a-f]{48}$/;
export const LIBRARY_LISTS = ['watchlist', 'liked', 'watched'];
export const RESULTS_PER_SEARCH = 5;

const GENRES = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary',
  18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction', 10770: 'TV Movie', 53: 'Thriller',
  10752: 'War', 37: 'Western',
};

/** Same slug rule as toMovieSlug() on the website: /movie/inception-27205 */
export function movieUrl(baseUrl, tmdbId, title = '') {
  const slug = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+)|(-+$)/g, '');
  return `${baseUrl}/movie/${slug ? `${slug}-${tmdbId}` : tmdbId}`;
}

function nextUtcMidnight(now) {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

function toMovie(raw, baseUrl, reason = null) {
  const year = Number.parseInt(String(raw.release_date ?? '').slice(0, 4), 10);
  const rating = Number(raw.vote_average);
  const title = raw.title || raw.name || 'Untitled';
  return {
    tmdbId: raw.id,
    title,
    year: Number.isFinite(year) ? year : null,
    rating: Number.isFinite(rating) && rating > 0 ? Math.round(rating * 10) / 10 : null,
    overview: String(raw.overview ?? '').trim(),
    genres: (raw.genre_ids ?? []).map((id) => GENRES[id]).filter(Boolean),
    reason,
    url: movieUrl(baseUrl, raw.id, title),
  };
}

const AUTH_HINT = 'Sign in at https://www.cineblock.in, open Profile, copy your CineBlock Terminal token (it starts with cb_), then run `cineblock login`.';

function errorFromResponse(status, body, feature) {
  const message = typeof body?.error === 'string' ? body.error : '';
  if (status === 401) {
    return new CliError('AUTH_INVALID', 'CineBlock did not accept your CLI token. It may have been replaced by a newer one.', { hint: AUTH_HINT });
  }
  if (status === 429 && message === 'Daily limit reached') {
    return new CliError('QUOTA_EXCEEDED', "You've used all of today's searches.", {
      hint: 'Your searches refill at midnight UTC. Your library and `cineblock status` still work in the meantime.',
    });
  }
  if (status === 429) {
    return new CliError('RATE_LIMITED', 'CineBlock is getting a lot of requests from you right now.', { hint: 'Wait a minute, then try again.' });
  }
  if (status === 404) {
    return new CliError('NOT_AVAILABLE', `${feature} isn't available on this CineBlock server yet.`, {
      hint: 'Try again later, or update with `npm install -g cineblock@latest`.',
    });
  }
  if (status >= 500) {
    return new CliError('SERVER', `CineBlock had a problem on its side while loading ${feature.toLowerCase()}.`, { hint: 'Try again in a moment.' });
  }
  return new CliError('SERVER', `CineBlock could not handle that request (${status}${message ? `: ${message}` : ''}).`);
}

/**
 * @param {object} options
 * @param {string} [options.baseUrl] CineBlock origin, default https://www.cineblock.in
 * @param {string|null} [options.token] cb_ CLI token, needed for quota and library calls
 * @param {typeof fetch} [options.fetch]
 * @param {() => number} [options.now]
 * @param {number} [options.timeoutMs]
 */
export function createApi({ baseUrl = DEFAULT_BASE_URL, token = null, fetch = globalThis.fetch, now = Date.now, timeoutMs = 20_000 } = {}) {
  const base = baseUrl.replace(/\/+$/, '');

  async function request(path, { method = 'GET', body, auth = false, feature }) {
    const headers = {};
    if (auth) {
      if (!token) throw new CliError('AUTH_MISSING', "You're not signed in to CineBlock Terminal yet.", { hint: AUTH_HINT });
      headers.Authorization = `Bearer ${token}`;
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let res;
    try {
      res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      throw new CliError('NETWORK', timedOut ? 'CineBlock took too long to answer.' : "Couldn't reach CineBlock.", {
        hint: 'Check your internet connection and try again.',
      });
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.ok === false) throw errorFromResponse(res.status, data, feature);
    // A web page instead of JSON means this server doesn't have the endpoint (yet).
    if (data === null) throw errorFromResponse(404, null, feature);
    return data;
  }

  function quotaFrom(data) {
    const used = Number(data.searchesUsed ?? 0);
    const remaining = Number(data.searchesRemaining ?? 0);
    return { used, remaining, limit: used + remaining, resetsAt: nextUtcMidnight(now()) };
  }

  return {
    baseUrl: base,

    /** Who owns the token and how many searches are left. Does not spend a search. */
    async account() {
      const data = await request('/api/cli', { auth: true, feature: 'Your account' });
      return { name: data.name ?? 'there', quota: quotaFrom(data) };
    },

    /** Spend one search from today's quota. Call once per search, not per reroll. */
    async chargeSearch() {
      const data = await request('/api/cli', { method: 'POST', auth: true, feature: 'Your search quota' });
      return { name: data.name ?? 'there', quota: quotaFrom(data) };
    },

    /** Newest-first entries from one of the user's lists. */
    async library(list, limit = 20) {
      const params = new URLSearchParams({ list, limit: String(limit) });
      const data = await request(`/api/cli/library?${params}`, { auth: true, feature: 'Your library' });
      return {
        list,
        total: typeof data.total === 'number' ? data.total : null,
        items: (data.items ?? []).map((item) => ({
          tmdbId: item.tmdbId,
          title: item.title,
          addedAt: item.addedAt ?? null,
          url: movieUrl(base, item.tmdbId, item.title),
        })),
      };
    },

    /**
     * Guided search with the same body the website sends.
     * @param {{keywordId:number|null, languages:string[], yearFrom:number, yearTo:number}} filters
     * @param {{excludeIds?: number[], personalization?: object}} [options]
     */
    async findGuided(filters, { excludeIds = [], personalization } = {}) {
      const data = await request('/api/find-movie', {
        method: 'POST',
        body: { ...filters, excludeIds, ...(personalization ? { personalization } : {}) },
        feature: 'Guided search',
      });
      return (data.movies ?? []).slice(0, RESULTS_PER_SEARCH).map((m) => toMovie(m, base));
    },

    /**
     * Turn AI suggestions into real CineBlock titles. Unknown titles are dropped.
     * @param {{title:string, year?:number|null, reason?:string|null}[]} suggestions
     * @param {{excludeIds?: Iterable<number>, limit?: number}} [options]
     */
    async resolveTitles(suggestions, { excludeIds = [], limit = RESULTS_PER_SEARCH } = {}) {
      const lookup = async ({ title, year }) => {
        for (const withYear of year ? [true, false] : [false]) {
          const params = new URLSearchParams({ action: 'search', query: title.slice(0, 150) });
          if (withYear) params.set('year', String(year));
          const data = await request(`/api/movies?${params}`, { feature: 'Title lookup' }).catch((err) => {
            if (err.code === 'NETWORK' || err.code === 'RATE_LIMITED') throw err;
            return null;
          });
          const hit = data?.results?.[0];
          if (hit) return hit;
        }
        return null;
      };
      // ponytail: all lookups at once; fine for the 8 titles we ask for, pool them if that grows.
      const hits = await Promise.all(suggestions.map(lookup));
      const seen = new Set(excludeIds);
      const movies = [];
      hits.forEach((hit, i) => {
        if (!hit || seen.has(hit.id) || movies.length >= limit) return;
        seen.add(hit.id);
        movies.push(toMovie(hit, base, suggestions[i].reason ?? null));
      });
      return movies;
    },
  };
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi, movieUrl } from '../src/api.js';
import { fakeFetch, jsonResponse, NOW, on, TOKEN, tmdbMovie } from './helpers.js';

const make = (routes, token = TOKEN) => {
  const fake = fakeFetch(routes);
  return { api: createApi({ token, fetch: fake.fetch, now: () => NOW }), calls: fake.calls };
};

test('movie links use the website slug rule', () => {
  assert.equal(movieUrl('https://www.cineblock.in', 27205, 'Inception'), 'https://www.cineblock.in/movie/inception-27205');
  assert.equal(movieUrl('https://www.cineblock.in', 1, "Amélie: Part 2!"), 'https://www.cineblock.in/movie/am-lie-part-2-1');
});

test('account reads quota without spending a search', async () => {
  const { api, calls } = make([[on('GET', '/api/cli'), () => jsonResponse(200, { ok: true, name: 'Pat', searchesUsed: 3, searchesRemaining: 12 })]]);
  const account = await api.account();
  assert.deepEqual(account, { name: 'Pat', quota: { used: 3, remaining: 12, limit: 15, resetsAt: '2026-11-21T00:00:00.000Z' } });
  assert.equal(calls[0].headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(calls[0].url.origin, 'https://www.cineblock.in');
});

test('server answers map to stable error codes', async () => {
  const cases = [
    [401, { ok: false, error: 'Invalid token' }, 'AUTH_INVALID'],
    [429, { ok: false, error: 'Daily limit reached', searchesRemaining: 0 }, 'QUOTA_EXCEEDED'],
    [429, { error: 'Too many requests' }, 'RATE_LIMITED'],
    [500, { ok: false, error: 'Server error' }, 'SERVER'],
    [404, null, 'NOT_AVAILABLE'],
  ];
  for (const [status, body, code] of cases) {
    const { api } = make([[() => true, () => (body ? jsonResponse(status, body) : new Response('<html>', { status }))]]);
    await assert.rejects(api.chargeSearch(), { code }, `${status} should be ${code}`);
  }
  const html = make([[() => true, () => new Response('<!DOCTYPE html>', { status: 200 })]]);
  await assert.rejects(html.api.library('liked'), { code: 'NOT_AVAILABLE' });
  const offline = createApi({ token: TOKEN, fetch: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(offline.account(), { code: 'NETWORK' });
});

test('calls that need a token fail before any request when signed out', async () => {
  const { api, calls } = make([], null);
  await assert.rejects(api.account(), { code: 'AUTH_MISSING' });
  assert.equal(calls.length, 0);
});

test('guided search sends the website body and returns at most five movies', async () => {
  const movies = Array.from({ length: 7 }, (_, i) => tmdbMovie(i + 1, `Film ${i + 1}`));
  const { api, calls } = make([[on('POST', '/api/find-movie'), () => jsonResponse(200, { movies })]]);
  const filters = { keywordId: 10854, languages: ['en'], yearFrom: 2010, yearTo: 2019 };
  const out = await api.findGuided(filters, { excludeIds: [9] });
  assert.equal(out.length, 5);
  assert.deepEqual(calls[0].body, { ...filters, excludeIds: [9] });
  assert.equal(calls[0].headers.Authorization, undefined, 'find-movie is public; never send the token there');
  assert.deepEqual(out[0], {
    tmdbId: 1, title: 'Film 1', year: 2014, rating: 7.6, overview: 'Film 1 overview',
    genres: ['Action', 'Science Fiction'], reason: null, url: 'https://www.cineblock.in/movie/film-1-1',
  });
});

test('title resolution retries without the year, drops misses, dedupes and excludes', async () => {
  const { api } = make([[on('GET', '/api/movies'), (url) => {
    const q = url.searchParams.get('query');
    const year = url.searchParams.get('year');
    if (q === 'Arrival' && year === '2015') return jsonResponse(200, { results: [] });
    if (q === 'Arrival') return jsonResponse(200, { results: [tmdbMovie(329865, 'Arrival')] });
    if (q === 'Arrival (2016)') return jsonResponse(200, { results: [tmdbMovie(329865, 'Arrival')] });
    if (q === 'Heat') return jsonResponse(200, { results: [tmdbMovie(949, 'Heat')] });
    return jsonResponse(200, { results: [] });
  }]]);
  const out = await api.resolveTitles(
    [{ title: 'Arrival', year: 2015, reason: 'Language.' }, { title: 'Arrival (2016)', year: null }, { title: 'Heat', year: 1995 }, { title: 'Nope', year: 2000 }],
    { excludeIds: [949] },
  );
  assert.deepEqual(out.map((m) => [m.tmdbId, m.reason]), [[329865, 'Language.']]);
});

test('library returns newest-first items with links', async () => {
  const { api, calls } = make([[on('GET', '/api/cli/library'), () => jsonResponse(200, { ok: true, list: 'watchlist', total: 42, items: [{ tmdbId: 603, title: 'The Matrix', posterPath: '/p.jpg', addedAt: '2026-11-01T00:00:00.000Z' }] })]]);
  const out = await api.library('watchlist', 5);
  assert.equal(calls[0].url.search, '?list=watchlist&limit=5');
  assert.deepEqual(out, { list: 'watchlist', total: 42, items: [{ tmdbId: 603, title: 'The Matrix', addedAt: '2026-11-01T00:00:00.000Z', url: 'https://www.cineblock.in/movie/the-matrix-603' }] });
});

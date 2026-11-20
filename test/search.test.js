import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSearch } from '../src/search.js';
import { CliError } from '../src/errors.js';

const QUOTA = { used: 1, remaining: 14, limit: 15, resetsAt: '2026-11-21T00:00:00.000Z' };
const movie = (id) => ({ tmdbId: id, title: `Film ${id}`, year: 2020, rating: 7, overview: '', genres: [], reason: null, url: '' });

function fakeApi({ guided = [], resolved = [], library = [] } = {}) {
  const log = { charges: 0, guided: [], resolve: [], library: [] };
  return {
    log,
    async chargeSearch() { log.charges++; return { name: 'Pat', quota: QUOTA }; },
    async findGuided(filters, opts) { log.guided.push({ filters, ...opts }); return guided.shift() ?? []; },
    async resolveTitles(suggestions, opts) { log.resolve.push({ suggestions, excludeIds: [...opts.excludeIds] }); return resolved.shift() ?? []; },
    async library(list) { log.library.push(list); return { list, total: null, items: library.filter((i) => i.list === list) }; },
  };
}

test('guided search spends one search, rerolls exclude everything already shown', async () => {
  const api = fakeApi({ guided: [[movie(1), movie(2)], [movie(3)]] });
  const search = createSearch({ api, mode: 'guided', filters: { keywordId: 10854, languages: ['any'], yearFrom: 2010, yearTo: 2019 }, excludeIds: [99] });
  const first = await search.next();
  const second = await search.next();
  assert.equal(api.log.charges, 1);
  assert.deepEqual(first.quota, QUOTA);
  assert.deepEqual(second.movies.map((m) => m.tmdbId), [3]);
  assert.deepEqual(api.log.guided[1].excludeIds, [99, 1, 2]);
  assert.equal(api.log.library.length, 0, 'no personalization when a story signal is chosen');
});

test('guided search with any signal sends personalization like the website', async () => {
  const api = fakeApi({ guided: [[movie(1)], [movie(2)]], library: [{ list: 'liked', tmdbId: 500 }, { list: 'watched', tmdbId: 600 }] });
  const search = createSearch({ api, mode: 'guided', filters: { keywordId: null, languages: ['any'], yearFrom: 2011, yearTo: 2026 } });
  await search.next();
  await search.next();
  assert.deepEqual(api.log.guided[0].personalization, { likedIds: [500], watchlistIds: [], watchedIds: [600], preferredLanguages: [] });
  assert.equal(api.log.library.length, 3, 'lists are read once per search, not per reroll');
});

test('AI search asks the provider first, so failures and empty answers cost nothing', async () => {
  const api = fakeApi();
  const failing = createSearch({ api, mode: 'ai', query: 'x', suggest: async () => { throw new CliError('AI_PROVIDER', 'nope'); } });
  await assert.rejects(failing.next(), { code: 'AI_PROVIDER' });
  const empty = createSearch({ api, mode: 'ai', query: 'x', suggest: async () => [] });
  assert.deepEqual((await empty.next()).movies, []);
  assert.equal(api.log.charges, 0);
});

test('AI rerolls pass shown titles to the provider and shown ids to verification', async () => {
  const api = fakeApi({ resolved: [[movie(1)], [movie(2)]] });
  const asked = [];
  const search = createSearch({
    api, mode: 'ai', query: 'heists', ai: { key: 'gsk_x' }, excludeIds: [7],
    suggest: async (query, opts) => { asked.push(opts.excludeTitles); return [{ title: 'Anything', year: null, reason: null }]; },
  });
  await search.next();
  await search.next();
  assert.equal(api.log.charges, 1);
  assert.deepEqual(asked, [[], ['Film 1']]);
  assert.deepEqual(api.log.resolve[1].excludeIds, [7, 1]);
});

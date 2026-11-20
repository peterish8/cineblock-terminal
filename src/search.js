// One search, guided or AI, that can be rerolled for fresh picks.
//
// Rules shared by the interactive and flag-driven paths:
// - A search spends one search from today's quota, once. Rerolls are free.
// - AI search asks the provider first, so a bad AI key never costs a search.
// - Every reroll excludes titles already shown, like the website's reroll.
// - Guided search sends the same personalization the website sends for a
//   signed-in user (recent liked, watchlist and watched IDs) when the story
//   signal is "any"; the server ignores it otherwise.
import { suggestTitles } from './ai.js';

const PERSONALIZE_PER_LIST = 10;

async function loadPersonalization(api) {
  const lists = await Promise.all(
    ['liked', 'watchlist', 'watched'].map((list) => api.library(list, PERSONALIZE_PER_LIST).catch(() => null)),
  );
  if (lists.every((l) => !l || l.items.length === 0)) return undefined;
  const ids = (l) => (l ? l.items.map((i) => i.tmdbId) : []);
  return { likedIds: ids(lists[0]), watchlistIds: ids(lists[1]), watchedIds: ids(lists[2]), preferredLanguages: [] };
}

/**
 * @param {object} options
 * @param {ReturnType<import('./api.js').createApi>} options.api
 * @param {'guided'|'ai'} options.mode
 * @param {object} [options.filters] guided filters from buildGuidedFilters()
 * @param {string} [options.query] AI request text
 * @param {{key?:string, model?:string}} [options.ai]
 * @param {number[]} [options.excludeIds] TMDB IDs never to show
 * @param {typeof suggestTitles} [options.suggest] injectable for tests
 */
export function createSearch({ api, mode, filters, query, ai = {}, excludeIds = [], suggest = suggestTitles }) {
  const seenIds = new Set(excludeIds);
  const seenTitles = new Set();
  let quota = null;
  let personalization;

  async function chargeOnce() {
    if (!quota) quota = (await api.chargeSearch()).quota;
  }

  async function runGuided() {
    await chargeOnce();
    if (personalization === undefined && filters.keywordId === null) {
      personalization = (await loadPersonalization(api)) ?? null;
    }
    return api.findGuided(filters, { excludeIds: [...seenIds], personalization: personalization ?? undefined });
  }

  async function runAi() {
    const suggestions = await suggest(query, { ...ai, excludeTitles: [...seenTitles] });
    if (suggestions.length === 0) return [];
    await chargeOnce();
    return api.resolveTitles(suggestions, { excludeIds: seenIds });
  }

  return {
    /** Fetch the next set of up to five movies. The first call spends the search. */
    async next() {
      const movies = mode === 'ai' ? await runAi() : await runGuided();
      for (const movie of movies) {
        seenIds.add(movie.tmdbId);
        seenTitles.add(movie.title);
      }
      return { movies, quota };
    },
    get quota() {
      return quota;
    },
  };
}

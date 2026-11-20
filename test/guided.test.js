import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGuidedFilters, describeFilters, LANGUAGES, resolveEra, resolveLanguages, resolveSignal, STORY_SIGNALS } from '../src/guided.js';

const NOW = new Date('2026-11-20T10:00:00Z');

test('story signals mirror the website wizard', () => {
  assert.equal(STORY_SIGNALS.length, 28);
  assert.deepEqual(STORY_SIGNALS[1], { label: 'Based on Novel', id: 818, slug: 'based-on-novel' });
  assert.equal(new Set(STORY_SIGNALS.map((s) => s.id)).size, 28);
  assert.deepEqual(LANGUAGES.map((l) => l.code), ['any', 'en', 'hi', 'ta', 'te', 'ml', 'kn', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'zh', 'pt', 'ru', 'ar', 'tr', 'id', 'th']);
});

test('signals resolve from labels, slugs, ids and "any"', () => {
  assert.equal(resolveSignal('time loop'), 10854);
  assert.equal(resolveSignal('Time-Loop'), 10854);
  assert.equal(resolveSignal('k drama'), 318385);
  assert.equal(resolveSignal('818'), 818);
  assert.equal(resolveSignal('any'), null);
  assert.equal(resolveSignal(undefined), null);
  assert.throws(() => resolveSignal('romcom'), { code: 'USAGE' });
});

test('languages accept codes and names, collapse to any, cap at five', () => {
  assert.deepEqual(resolveLanguages(undefined), ['any']);
  assert.deepEqual(resolveLanguages(['en,ko', 'Japanese']), ['en', 'ko', 'ja']);
  assert.deepEqual(resolveLanguages('en,any'), ['any']);
  assert.deepEqual(resolveLanguages('espanol'), ['es']);
  assert.deepEqual(resolveLanguages('en,en'), ['en']);
  assert.throws(() => resolveLanguages('en,hi,ta,te,ml,kn'), { code: 'USAGE' });
  assert.throws(() => resolveLanguages('klingon'), { code: 'USAGE' });
});

test('era defaults to the website window of the last 15 years', () => {
  assert.deepEqual(resolveEra({}, NOW), { yearFrom: 2011, yearTo: 2026 });
  assert.deepEqual(resolveEra({ era: '1990s' }, NOW), { yearFrom: 1990, yearTo: 1999 });
  assert.deepEqual(resolveEra({ from: '2001' }, NOW), { yearFrom: 2001, yearTo: 2026 });
  assert.deepEqual(resolveEra({ to: '1960' }, NOW), { yearFrom: 1950, yearTo: 1960 });
  assert.throws(() => resolveEra({ era: '2010s', from: '2000' }, NOW), { code: 'USAGE' });
  assert.throws(() => resolveEra({ from: '1949' }, NOW), { code: 'USAGE' });
  assert.throws(() => resolveEra({ from: '2020', to: '2010' }, NOW), { code: 'USAGE' });
  assert.throws(() => resolveEra({ era: 'roaring20s' }, NOW), { code: 'USAGE' });
});

test('filters match the /api/find-movie body', () => {
  const filters = buildGuidedFilters({ signal: 'heist', language: ['ko'], from: '2015', to: '2024' }, NOW);
  assert.deepEqual(filters, { keywordId: 10349, languages: ['ko'], yearFrom: 2015, yearTo: 2024 });
  assert.equal(describeFilters(filters), 'Heist · Korean · 2015 to 2024');
});

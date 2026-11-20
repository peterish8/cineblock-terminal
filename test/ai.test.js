import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectProvider, parseSuggestions, suggestTitles } from '../src/ai.js';
import { fakeFetch, jsonResponse } from './helpers.js';

test('provider is detected from the key prefix', () => {
  assert.equal(detectProvider('AIzaSyExample'), 'gemini');
  assert.equal(detectProvider('gsk_example'), 'groq');
  assert.equal(detectProvider('sk-or-v1-example'), 'openrouter');
  assert.equal(detectProvider('sk-proj-example'), null);
});

test('suggestions parse from fences, prose and wrapper objects', () => {
  assert.deepEqual(parseSuggestions('```json\n[{"title":"Arrival","year":2016,"reason":"Calm."}]\n```'), [{ title: 'Arrival', year: 2016, reason: 'Calm.' }]);
  assert.deepEqual(parseSuggestions('Sure! [{"title":"Heat","release_year":"1995"}] Enjoy'), [{ title: 'Heat', year: 1995, reason: null }]);
  assert.deepEqual(parseSuggestions('{"movies":[{"title":"Up"},{"title":"up"},{"title":""}]}'), [{ title: 'Up', year: null, reason: null }]);
  assert.deepEqual(parseSuggestions('no json here'), []);
});

test('a missing key is AI_KEY_MISSING and never calls anything', async () => {
  await assert.rejects(suggestTitles('anything', { key: null, fetch: () => assert.fail('no fetch') }), { code: 'AI_KEY_MISSING' });
});

test('gemini gets the key in a header and the exclusions in the prompt', async () => {
  const { fetch, calls } = fakeFetch([[() => true, () => jsonResponse(200, { candidates: [{ content: { parts: [{ text: '[{"title":"Moon","year":2009}]' }] } }] })]]);
  const out = await suggestTitles('lonely sci-fi', { key: 'AIzaTestKey', excludeTitles: ['Solaris'], fetch });
  assert.deepEqual(out, [{ title: 'Moon', year: 2009, reason: null }]);
  assert.equal(calls[0].headers['x-goog-api-key'], 'AIzaTestKey');
  assert.ok(!calls[0].url.href.includes('AIzaTestKey'), 'key must not be in the URL');
  assert.match(calls[0].url.pathname, /gemini-flash-latest:generateContent$/);
  assert.match(calls[0].body.contents[0].parts[0].text, /Solaris/);
});

test('openai-compatible providers use bearer auth and the chosen model', async () => {
  const { fetch, calls } = fakeFetch([[() => true, () => jsonResponse(200, { choices: [{ message: { content: '[{"title":"Heat","year":1995}]' } }] })]]);
  await suggestTitles('heists', { key: 'gsk_test', model: 'qwen/qwen3.6-27b', fetch });
  assert.equal(calls[0].url.origin, 'https://api.groq.com');
  assert.equal(calls[0].headers.Authorization, 'Bearer gsk_test');
  assert.equal(calls[0].body.model, 'qwen/qwen3.6-27b');
});

test('provider failures become plain AI_PROVIDER errors', async () => {
  const rejected = fakeFetch([[() => true, () => jsonResponse(401, { error: 'bad key' })]]);
  await assert.rejects(suggestTitles('x', { key: 'sk-or-v1-x', fetch: rejected.fetch }), (err) => err.code === 'AI_PROVIDER' && /didn't accept your API key/.test(err.message));
  const offline = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(suggestTitles('x', { key: 'gsk_x', fetch: offline }), { code: 'AI_PROVIDER' });
  await assert.rejects(suggestTitles('x', { key: 'unknown-key-format' }), { code: 'AI_KEY_MISSING' });
});

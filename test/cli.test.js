import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { run } from '../src/cli.js';
import { fakeFetch, jsonResponse, memoryStore, memoryStream, NOW, on, stdinFrom, TOKEN, tmdbMovie } from './helpers.js';

async function cli(argv, { routes = [], store = memoryStore(), stdin = stdinFrom(''), env = {} } = {}) {
  const stdout = memoryStream();
  const stderr = memoryStream();
  const { fetch, calls } = fakeFetch(routes);
  const opened = [];
  const code = await run(argv, { env: { ...env }, stdout, stderr, stdin, fetch, now: () => NOW, store, openUrl: async (url) => { opened.push(url); return true; } });
  const parse = () => JSON.parse(stdout.data);
  return { code, stdout: stdout.data, stderr: stderr.data, json: parse, calls, opened, store };
}

const charge = (used = 1) => [on('POST', '/api/cli'), () => jsonResponse(200, { ok: true, name: 'Pat', searchesUsed: used, searchesRemaining: 15 - used })];
const findMovie = (movies) => [on('POST', '/api/find-movie'), () => jsonResponse(200, { movies })];

test('guided --json prints one envelope with filters, quota and results', async () => {
  const r = await cli(['guided', '--signal', 'time loop', '--language', 'en', '--era', '2010s', '--json'], { routes: [charge(), findMovie([tmdbMovie(137113, 'Edge of Tomorrow')])] });
  assert.equal(r.code, 0);
  assert.equal(r.stderr, '');
  const out = r.json();
  assert.equal(out.schemaVersion, 1);
  assert.equal(out.ok, true);
  assert.equal(out.command, 'guided');
  assert.deepEqual(out.filters, { keywordId: 10854, languages: ['en'], yearFrom: 2010, yearTo: 2019 });
  assert.equal(out.quota.remaining, 14);
  assert.equal(out.results[0].url, 'https://www.cineblock.in/movie/edge-of-tomorrow-137113');
});

test('guided without flags outside a terminal uses website defaults and never prompts', async () => {
  const r = await cli(['guided'], { routes: [charge(), findMovie([tmdbMovie(1, 'One')]), [on('GET', '/api/cli/library'), () => jsonResponse(200, { ok: true, items: [] })]] });
  assert.equal(r.code, 0);
  const body = r.calls.find((c) => c.url.pathname === '/api/find-movie').body;
  assert.deepEqual([body.keywordId, body.languages, body.yearFrom, body.yearTo], [null, ['any'], 2011, 2026]);
  assert.match(r.stdout, /One/);
});

test('quota exhaustion is exit 4 with a plain message', async () => {
  const r = await cli(['guided', '--json'], { routes: [[on('POST', '/api/cli'), () => jsonResponse(429, { ok: false, error: 'Daily limit reached' })]] });
  assert.equal(r.code, 4);
  assert.equal(r.json().error.code, 'QUOTA_EXCEEDED');
  const human = await cli(['guided'], { routes: [[on('POST', '/api/cli'), () => jsonResponse(429, { ok: false, error: 'Daily limit reached' })]] });
  assert.match(human.stderr, /used all of today's searches/);
  assert.match(human.stderr, /midnight UTC/);
});

test('an empty search is exit 7', async () => {
  const r = await cli(['guided', '--signal', 'heist', '--json'], { routes: [charge(), findMovie([])] });
  assert.equal(r.code, 7);
  assert.equal(r.json().error.code, 'NO_RESULTS');
});

test('signed out is exit 3 and no request is made', async () => {
  const r = await cli(['status', '--json'], { store: memoryStore({ token: null }) });
  assert.equal(r.code, 3);
  assert.equal(r.calls.length, 0);
});

test('ai-key refuses a CineBlock token and stores a real key from stdin', async () => {
  const store = memoryStore();
  assert.equal((await cli(['ai-key', '--key-stdin'], { store, stdin: stdinFrom(TOKEN) })).code, 2);
  const r = await cli(['ai-key', '--key-stdin', '--json'], { store, stdin: stdinFrom('gsk_abcdefghijklmnopqrstuvwxyz\n') });
  assert.equal(r.json().provider, 'groq');
  assert.equal(store.state.aiKey, 'gsk_abcdefghijklmnopqrstuvwxyz');
});

test('ai without a key is exit 6 and spends nothing', async () => {
  const r = await cli(['ai', 'cozy', 'mysteries', '--json']);
  assert.equal(r.code, 6);
  assert.equal(r.json().error.code, 'AI_KEY_MISSING');
  assert.equal(r.calls.length, 0);
});

test('login reads the token from stdin, checks it, then stores it', async () => {
  const store = memoryStore({ token: null });
  const r = await cli(['login', '--token-stdin', '--json'], { store, stdin: stdinFrom(`${TOKEN}\n`), routes: [[on('GET', '/api/cli'), () => jsonResponse(200, { ok: true, name: 'Pat', searchesUsed: 0, searchesRemaining: 15 })]] });
  assert.equal(r.code, 0);
  assert.equal(store.state.token, TOKEN);
  assert.equal(r.json().account.name, 'Pat');
  assert.ok(!r.stdout.includes(TOKEN), 'the token is never printed');
});

test('login refuses an mcp_ token before contacting anyone', async () => {
  const store = memoryStore({ token: null });
  const r = await cli(['login', '--token-stdin'], { store, stdin: stdinFrom(`mcp_${'d'.repeat(48)}`) });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /MCP token/);
  assert.equal(r.calls.length, 0);
  assert.equal(store.state.token, null);
});

test('a rejected token does not get saved', async () => {
  const store = memoryStore({ token: null });
  const r = await cli(['login', '--token-stdin'], { store, stdin: stdinFrom(TOKEN), routes: [[on('GET', '/api/cli'), () => jsonResponse(401, { ok: false, error: 'Invalid token' })]] });
  assert.equal(r.code, 3);
  assert.equal(store.state.token, null);
});

test('open accepts ids and links, and --print never opens a browser', async () => {
  const printed = await cli(['open', 'https://www.cineblock.in/movie/inception-27205', '--print']);
  assert.equal(printed.stdout.trim(), 'https://www.cineblock.in/movie/27205');
  assert.deepEqual(printed.opened, []);
  const opened = await cli(['open', '603', '--json']);
  assert.deepEqual(opened.opened, ['https://www.cineblock.in/movie/603']);
  assert.equal(opened.json().opened, true);
  assert.equal((await cli(['open', 'inception'])).code, 2);
});

test('list validates its arguments', async () => {
  assert.equal((await cli(['list', 'favourites'])).code, 2);
  assert.equal((await cli(['list', 'liked', '--limit', '500'])).code, 2);
  const r = await cli(['list', 'liked', '--json'], { routes: [[on('GET', '/api/cli/library'), () => jsonResponse(200, { ok: true, list: 'liked', total: 0, items: [] })]] });
  assert.deepEqual(r.json().items, []);
});

test('usage errors: unknown command, unknown option, no command off a terminal', async () => {
  assert.equal((await cli(['frobnicate'])).code, 2);
  assert.equal((await cli(['guided', '--colour'])).code, 2);
  const bare = await cli([]);
  assert.equal(bare.code, 2);
  assert.match(bare.stderr, /Usage/);
});

test('help topics exist for every command and agents', async () => {
  for (const topic of ['guided', 'ai', 'login', 'logout', 'status', 'list', 'open', 'ai-key', 'options', 'agents', 'exit-codes']) {
    const r = await cli(['help', topic]);
    assert.equal(r.code, 0, topic);
  }
  assert.match((await cli(['guided', '--help'])).stdout, /--signal/);
});

test('CINEBLOCK_API_URL must be https except for localhost', async () => {
  assert.equal((await cli(['status'], { env: { CINEBLOCK_API_URL: 'http://evil.example' } })).code, 2);
  const local = await cli(['status', '--json'], { env: { CINEBLOCK_API_URL: 'http://localhost:3000' }, routes: [[on('GET', '/api/cli'), () => jsonResponse(200, { ok: true, name: 'Pat', searchesUsed: 0, searchesRemaining: 15 })]] });
  assert.equal(local.code, 0);
  assert.equal(local.calls[0].url.origin, 'http://localhost:3000');
});

test('user-facing text has no em dashes', () => {
  for (const file of readdirSync(new URL('../src/', import.meta.url))) {
    const text = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert.ok(!text.includes('—'), `${file} contains an em dash`);
  }
});

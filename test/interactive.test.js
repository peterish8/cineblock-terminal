// Drives the real @inquirer/prompts UI through a fake terminal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { run } from '../src/cli.js';
import { fakeFetch, jsonResponse, memoryStore, memoryStream, NOW, on, stdinFrom, TOKEN, tmdbMovie } from './helpers.js';

const ENTER = '\r';
const DOWN = '\x1b[B';

function fakeTerminal() {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => input;
  const output = new PassThrough();
  // Inquirer pipes into the output and ends it after each prompt; a real stdout ignores that.
  Object.assign(output, { isTTY: true, columns: 100, rows: 40, end: () => output });
  let screen = '';
  output.on('data', (chunk) => { screen += chunk.toString(); });
  return { input, output, screen: () => screen };
}

/** Each step waits until `text` has appeared `times` times on screen, then presses `keys`. */
async function drive(term, steps) {
  for (const { text, times = 1, keys } of steps) {
    const deadline = Date.now() + 5000;
    while (term.screen().split(text).length - 1 < times) {
      if (Date.now() > deadline) throw new Error(`Timed out waiting for "${text}". Screen:
${JSON.stringify(term.screen().slice(-600))}`);
      await delay(10);
    }
    for (const key of keys) {
      term.input.write(key);
      await delay(15);
    }
  }
}

async function interactive(argv, { steps, routes, store = memoryStore() }) {
  const term = fakeTerminal();
  const stdout = memoryStream({ isTTY: true });
  const stderr = memoryStream();
  const { fetch, calls } = fakeFetch(routes);
  const [code] = await Promise.all([
    run(argv, { env: {}, stdout, stderr, stdin: stdinFrom(''), fetch, now: () => NOW, store, interactive: true, promptContext: { input: term.input, output: term.output } }),
    drive(term, steps),
  ]);
  return { code, stdout: stdout.data, stderr: stderr.data, calls, store };
}

test('guided asks the three website questions, then rerolls for free', async () => {
  let page = 0;
  const r = await interactive(['guided'], {
    routes: [
      [on('POST', '/api/cli'), () => jsonResponse(200, { ok: true, name: 'Pat', searchesUsed: 1, searchesRemaining: 14 })],
      [on('GET', '/api/cli/library'), () => jsonResponse(200, { ok: true, items: [] })],
      [on('POST', '/api/find-movie'), () => { page++; return jsonResponse(200, { movies: [tmdbMovie(page, `Pick ${page}`)] }); }],
    ],
    steps: [
      { text: 'Story signal', keys: [ENTER] },
      { text: 'Languages', keys: [ENTER] },
      { text: 'Release years', keys: [ENTER] },
      { text: 'What next?', keys: [ENTER] },
      { text: 'What next?', times: 2, keys: [DOWN, DOWN, ENTER] },
    ],
  });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Pick 1/);
  assert.match(r.stdout, /Pick 2/);
  const searches = r.calls.filter((c) => c.url.pathname === '/api/find-movie');
  assert.equal(searches.length, 2);
  assert.deepEqual(searches[0].body.languages, ['any']);
  assert.deepEqual(searches[1].body.excludeIds, [1]);
  assert.equal(r.calls.filter((c) => c.method === 'POST' && c.url.pathname === '/api/cli').length, 1, 'one search spent');
});

test('the menu signs you in first when no token is saved', async () => {
  const store = memoryStore({ token: null });
  const r = await interactive([], {
    store,
    routes: [[on('GET', '/api/cli'), () => jsonResponse(200, { ok: true, name: 'Pat', searchesUsed: 0, searchesRemaining: 15 })]],
    steps: [
      { text: 'Paste your CLI token', keys: [`mcp_${'e'.repeat(48)}`, ENTER] },
      { text: 'MCP token', keys: ['\x15'] },
      { text: 'Paste your CLI token', keys: [...Array(52).fill('\x7f'), TOKEN, ENTER] },
      { text: 'What would you like to do?', keys: [DOWN, DOWN, DOWN, DOWN, DOWN, DOWN, DOWN, ENTER] },
    ],
  });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(store.state.token, TOKEN);
  assert.match(r.stdout, /Signed in as/);
});

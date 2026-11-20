// Shared fakes for the test suite: a scripted fetch, memory streams and stores.
import { Readable } from 'node:stream';

export const TOKEN = `cb_${'a1'.repeat(24)}`;
export const NOW = Date.parse('2026-11-20T10:00:00.000Z');

export function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Fake fetch driven by a list of [matcher, responder] routes.
 * matcher: (url: URL, init) => boolean. responder: (url, init) => Response | Promise<Response>.
 * Every call is recorded in `calls`.
 */
export function fakeFetch(routes) {
  const calls = [];
  const fetch = async (input, init = {}) => {
    const url = new URL(input);
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init.method ?? 'GET', headers: init.headers ?? {}, body });
    const route = routes.find(([match]) => match(url, init));
    if (!route) throw new Error(`Unexpected request ${init.method ?? 'GET'} ${url}`);
    return route[1](url, init, body);
  };
  return { fetch, calls };
}

export const on = (method, path) => (url, init) => (init.method ?? 'GET') === method && url.pathname === path;

export function tmdbMovie(id, title, extra = {}) {
  return { id, title, release_date: '2014-05-28', vote_average: 7.64, overview: `${title} overview`, genre_ids: [28, 878], ...extra };
}

export function memoryStream({ isTTY = false } = {}) {
  return { isTTY, columns: 80, data: '', write(chunk) { this.data += chunk; return true; } };
}

export function stdinFrom(text) {
  const stream = Readable.from([text]);
  stream.isTTY = false;
  return stream;
}

export function memoryStore({ token = TOKEN, aiKey = null } = {}) {
  const state = { token, aiKey };
  return {
    state,
    getToken: async () => (state.token ? { value: state.token, source: 'file' } : null),
    setToken: async (t) => { state.token = t; return 'file'; },
    clearToken: async () => { state.token = null; },
    getAiKey: async () => (state.aiKey ? { value: state.aiKey, source: 'file' } : null),
    setAiKey: async (k) => { state.aiKey = k; return 'file'; },
    clearAiKey: async () => { state.aiKey = null; },
  };
}

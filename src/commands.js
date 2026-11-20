// Command handlers. Each takes the app context from src/cli.js plus parsed
// options, and prints through app.out(). Prompts only when app.interactive.
import { spawn } from 'node:child_process';
import { CliError } from './errors.js';
import { LIBRARY_LISTS } from './api.js';
import { buildGuidedFilters, describeFilters, eraPresets, LANGUAGES, STORY_SIGNALS } from './guided.js';
import { createSearch } from './search.js';
import { detectProvider, PROVIDERS } from './ai.js';
import { validateCliToken } from './credentials.js';
import { formatLibrary, formatMovies, formatQuota } from './render.js';

const STORED_IN = { env: 'the CINEBLOCK_TOKEN environment variable', keychain: 'your system keychain', file: 'a private config file' };

function parseIds(value) {
  return (value ?? '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const id = Number(s);
    if (!Number.isSafeInteger(id) || id <= 0) throw new CliError('USAGE', `--exclude takes TMDB IDs like 27205,603. "${s}" isn't one.`);
    return id;
  });
}

async function readStdin(stdin) {
  let text = '';
  for await (const chunk of stdin) text += chunk;
  return text.trim();
}

async function withSpinner(app, text, task) {
  const stop = app.spinner(text);
  try {
    return await task();
  } finally {
    stop();
  }
}

async function runSearch(app, command, search, details) {
  if (app.interactive) return (await app.ui()).browse(search, command);
  const { movies, quota } = await withSpinner(app, command === 'ai' ? 'Asking your AI and checking titles...' : 'Finding five picks...', () => search.next());
  if (movies.length === 0) {
    throw new CliError('NO_RESULTS', command === 'ai' ? "None of the AI's ideas matched a movie on CineBlock." : 'No movies matched those answers.', {
      hint: command === 'ai' ? 'Try describing it another way, or use guided search.' : 'Try Any language, a wider era, or a different story signal.',
    });
  }
  if (app.json) return app.out(app.jsonSuccess(command, { ...details, quota, results: movies }));
  app.out(`\n${formatMovies(movies, app.style, { columns: app.columns })}\n`);
  app.note(formatQuota(quota, app.errStyle, app.now()));
}

export async function guided(app, opts) {
  const flagged = ['signal', 'language', 'era', 'from', 'to'].some((k) => opts[k] !== undefined);
  const filters = app.interactive && !flagged ? await (await app.ui()).askGuidedFilters() : buildGuidedFilters(opts, new Date(app.now()));
  app.note(app.errStyle.muted(`\n${describeFilters(filters)}`));
  const search = createSearch({ api: await app.api(), mode: 'guided', filters, excludeIds: parseIds(opts.exclude) });
  return runSearch(app, 'guided', search, { filters });
}

export async function ai(app, opts, words) {
  let query = words.join(' ').trim();
  if (!query) {
    if (!app.interactive) throw new CliError('USAGE', 'Tell the AI what you want to watch.', { hint: 'Example: cineblock ai "slow-burn sci-fi with a hopeful ending"' });
    query = await (await app.ui()).askAiQuery();
  }
  if (query.length > 500) throw new CliError('USAGE', 'Keep the request under 500 characters.');
  let key = (await app.store.getAiKey())?.value;
  if (!key && app.interactive) {
    await (await app.ui()).askAndSaveAiKey();
    key = (await app.store.getAiKey())?.value;
  }
  const model = opts.model ?? app.env.CINEBLOCK_AI_MODEL;
  const search = createSearch({ api: await app.api(), mode: 'ai', query, ai: { key, model }, excludeIds: parseIds(opts.exclude) });
  return runSearch(app, 'ai', search, { query });
}

export async function login(app, opts) {
  let raw;
  if (opts['token-stdin']) raw = await readStdin(app.stdin);
  else if (app.interactive) raw = await (await app.ui()).askToken();
  else throw new CliError('USAGE', 'No token given.', { hint: 'Pipe it in with `cineblock login --token-stdin`, or set CINEBLOCK_TOKEN.' });
  const token = validateCliToken(raw);
  const account = await withSpinner(app, 'Checking your token with CineBlock...', () => app.apiWithToken(token).account());
  const storedIn = await app.store.setToken(token);
  if (app.json) return app.out(app.jsonSuccess('login', { account: { name: account.name }, quota: account.quota, stored: storedIn }));
  app.out(`${app.style.success('✔')} Signed in as ${app.style.bold(account.name)}. Token saved in ${STORED_IN[storedIn]}.`);
  app.out(formatQuota(account.quota, app.style, app.now()));
}

export async function logout(app) {
  await app.store.clearToken();
  if (app.json) return app.out(app.jsonSuccess('logout', { removed: ['token'] }));
  app.out(`${app.style.success('✔')} Signed out on this computer.`);
}

export async function status(app) {
  const saved = await app.store.getToken();
  const account = await withSpinner(app, 'Checking your account...', async () => (await app.api()).account());
  const key = (await app.store.getAiKey())?.value;
  const provider = key ? detectProvider(key) : null;
  const aiInfo = { provider, model: provider ? app.env.CINEBLOCK_AI_MODEL ?? PROVIDERS[provider].defaultModel : null, keySaved: Boolean(key) };
  if (app.json) return app.out(app.jsonSuccess('status', { account: { name: account.name, tokenSource: saved?.source ?? null }, quota: account.quota, ai: aiInfo }));
  const s = app.style;
  app.out(`Signed in as ${s.bold(account.name)} ${s.muted(`(token from ${STORED_IN[saved?.source] ?? 'unknown'})`)}`);
  app.out(formatQuota(account.quota, s, app.now()));
  app.out(provider ? `AI search: ${PROVIDERS[provider].label} ${s.muted(`(${aiInfo.model})`)}` : `AI search: ${s.muted('no key saved. Guided search works without one.')}`);
}

/** Throws a USAGE error unless this is a Gemini, Groq or OpenRouter key. */
export function checkAiKey(raw) {
  const key = String(raw ?? '').trim();
  if (key.startsWith('cb_') || key.startsWith('mcp_')) {
    throw new CliError('USAGE', "That's a CineBlock token, not an AI provider key.", { hint: 'AI keys come from Gemini, Groq or OpenRouter. The cb_ token goes in `cineblock login`.' });
  }
  const provider = detectProvider(key);
  if (!provider || key.length < 20) {
    throw new CliError('USAGE', "That doesn't look like a Gemini, Groq or OpenRouter key.", { hint: 'Gemini keys start with AIza, Groq with gsk_, OpenRouter with sk-or-.' });
  }
  return { key, provider };
}

/** Check and store an AI key. Shared with the interactive flow. */
export async function saveAiKey(app, raw) {
  const { key, provider } = checkAiKey(raw);
  return { provider, storedIn: await app.store.setAiKey(key) };
}

export async function aiKey(app, opts) {
  if (opts.clear) {
    await app.store.clearAiKey();
    return app.out(app.json ? app.jsonSuccess('ai-key', { removed: true }) : `${app.style.success('✔')} AI key removed.`);
  }
  if (!opts['key-stdin']) {
    if (!app.interactive) throw new CliError('USAGE', 'No key given.', { hint: 'Pipe it in with `cineblock ai-key --key-stdin`, or set CINEBLOCK_AI_KEY.' });
    return (await app.ui()).askAndSaveAiKey();
  }
  const { provider, storedIn } = await saveAiKey(app, await readStdin(app.stdin));
  if (app.json) return app.out(app.jsonSuccess('ai-key', { stored: storedIn, provider }));
  app.out(`${app.style.success('✔')} ${PROVIDERS[provider].label} key saved in ${STORED_IN[storedIn]}. It's checked on your first AI search.`);
}

export async function list(app, opts, [name]) {
  if (!LIBRARY_LISTS.includes(name)) {
    throw new CliError('USAGE', name ? `"${name}" isn't a list.` : 'Which list?', { hint: 'Use watchlist, liked or watched, e.g. cineblock list watchlist' });
  }
  const limit = Number(opts.limit ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new CliError('USAGE', '--limit must be a whole number from 1 to 100.');
  const result = await withSpinner(app, `Loading your ${name}...`, async () => (await app.api()).library(name, limit));
  if (app.json) return app.out(app.jsonSuccess('list', result));
  app.out(formatLibrary(result, app.style, { columns: app.columns }));
  if (result.items.length === 0) app.out(app.style.muted(`Nothing here yet. Add titles on ${app.baseUrl} and they show up here.`));
}

/** Accepts 27205 or a cineblock.in /movie/<slug>-<id> link. */
export function parseMovieTarget(input) {
  const text = String(input ?? '').trim();
  const id = /^\d+$/.test(text) ? text : text.match(/\/movie\/(?:[a-z0-9-]*-)?(\d+)\/?(?:[?#].*)?$/i)?.[1];
  if (!id) throw new CliError('USAGE', text ? `Couldn't find a movie in "${text}".` : 'Which movie?', { hint: 'Pass a TMDB ID like 27205, or a cineblock.in movie link.' });
  return Number(id);
}

function openInBrowser(url) {
  // rundll32 avoids cmd.exe parsing the URL on Windows.
  const [cmd, args] = process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : [process.platform === 'darwin' ? 'open' : 'xdg-open', [url]];
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.once('error', () => resolve(false));
    child.once('spawn', () => {
      child.unref();
      resolve(true);
    });
  });
}

export async function open(app, opts, [target]) {
  const id = parseMovieTarget(target);
  const url = `${app.baseUrl}/movie/${id}`;
  const opened = opts.print ? false : await (app.openUrl ?? openInBrowser)(url);
  if (app.json) return app.out(app.jsonSuccess('open', { tmdbId: id, url, opened }));
  app.out(opened ? `Opened ${app.style.muted(url)}` : url);
}

export async function options(app) {
  const signals = STORY_SIGNALS.map(({ label, slug, id }) => ({ label, slug, id }));
  const languages = LANGUAGES.map(({ code, name }) => ({ code, name }));
  const eras = eraPresets(new Date(app.now()));
  if (app.json) return app.out(app.jsonSuccess('options', { signals, languages, eras }));
  const s = app.style;
  app.out(`${s.bold('Story signals')} ${s.muted('(--signal)')}\n  ${signals.map((x) => x.label).join(', ')}, or any`);
  app.out(`\n${s.bold('Languages')} ${s.muted('(--language, up to 5)')}\n  ${languages.map((l) => `${l.code} ${s.muted(l.name)}`).join(', ')}`);
  app.out(`\n${s.bold('Eras')} ${s.muted('(--era, or --from/--to)')}\n${eras.map((e) => `  ${e.name.padEnd(8)} ${s.muted(e.label)}`).join('\n')}`);
}

export const HANDLERS = { guided, ai, login, logout, status, list, open, 'ai-key': aiKey, options };

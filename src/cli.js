// Parse argv, build the app context, run one command, report errors, return
// an exit code. `run()` never calls process.exit, so tests drive it with fake
// streams, fetch, clock and credential store.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { CliError, EXIT_CODES, toCliError } from './errors.js';
import { createStyle, startSpinner } from './term.js';
import { formatError, jsonError, jsonSuccess } from './render.js';
import { helpFor } from './help.js';
import { createApi, DEFAULT_BASE_URL } from './api.js';
import { createCredentialStore } from './credentials.js';

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const str = { type: 'string' };
const bool = { type: 'boolean' };
const GLOBAL_OPTIONS = { json: bool, 'no-color': bool, help: { ...bool, short: 'h' }, version: { ...bool, short: 'v' } };
// [options, max positionals]
const COMMANDS = {
  guided: [{ signal: str, language: { ...str, multiple: true }, era: str, from: str, to: str, exclude: str }, 0],
  ai: [{ model: str, exclude: str }, Infinity],
  login: [{ 'token-stdin': bool }, 0],
  logout: [{}, 0],
  status: [{}, 0],
  list: [{ limit: str }, 1],
  open: [{ print: bool }, 1],
  'ai-key': [{ 'key-stdin': bool, clear: bool }, 0],
  options: [{}, 0],
  help: [{}, 1],
};

function parse(argv) {
  const at = argv.findIndex((arg) => !arg.startsWith('-'));
  const command = at === -1 ? null : argv[at];
  if (command && !COMMANDS[command]) throw new CliError('USAGE', `"${command}" isn't a command.`, { hint: 'Run `cineblock --help` to see what you can do.' });
  const [options, maxPositionals] = COMMANDS[command] ?? [{}, 0];
  const args = at === -1 ? argv : argv.toSpliced(at, 1);
  const help = `Run \`cineblock ${command ? `${command} ` : ''}--help\` for usage.`;
  let parsed;
  try {
    parsed = parseArgs({ args, options: { ...GLOBAL_OPTIONS, ...options }, allowPositionals: true });
  } catch (err) {
    throw new CliError('USAGE', err.message.replace(/\. To specify a positional argument.*$/s, '.'), { hint: help });
  }
  if (parsed.positionals.length > maxPositionals) {
    throw new CliError('USAGE', `Unexpected argument "${parsed.positionals[maxPositionals]}".`, { hint: `Quote values that contain spaces. ${help}` });
  }
  return { command, opts: parsed.values, positionals: parsed.positionals };
}

// CINEBLOCK_API_URL points the CLI at a preview or local deployment.
function baseUrlFrom(env) {
  let url;
  try {
    url = new URL(env.CINEBLOCK_API_URL || DEFAULT_BASE_URL);
  } catch {
    throw new CliError('USAGE', 'CINEBLOCK_API_URL is not a valid URL.');
  }
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new CliError('USAGE', 'CINEBLOCK_API_URL must use https (http only for localhost).');
  }
  return url.origin;
}

/**
 * Run the CLI once and return the exit code.
 * @param {string[]} argv arguments after the program name
 * @param {object} [io] optional fakes: env, stdout, stderr, stdin, fetch, now, store, openUrl, interactive, promptContext
 */
export async function run(argv, io = {}) {
  const { env = process.env, stdout = process.stdout, stderr = process.stderr, stdin = process.stdin } = io;
  const noColor = argv.includes('--no-color');
  const style = createStyle({ env, stream: stdout, noColor });
  const errStyle = createStyle({ env, stream: stderr, noColor });
  let command = null;
  let json = argv.includes('--json');

  try {
    const parsed = parse(argv);
    command = parsed.command;
    const { opts, positionals } = parsed;

    if (opts.version) {
      stdout.write(`${json ? jsonSuccess('version', { version: VERSION }) : VERSION}\n`);
      return EXIT_CODES.OK;
    }
    if (opts.help || command === 'help') {
      const text = helpFor(command === 'help' ? positionals[0] : command);
      if (!text) throw new CliError('USAGE', `There's no help topic called "${positionals[0]}".`, { hint: 'Try: cineblock help agents' });
      stdout.write(`${text}\n`);
      return EXIT_CODES.OK;
    }

    const interactive = !json && (io.interactive ?? (Boolean(stdin.isTTY && stdout.isTTY) && env.CI !== 'true'));
    if (!command && !interactive) {
      stderr.write(`${helpFor()}\n`);
      return EXIT_CODES.USAGE;
    }

    const baseUrl = baseUrlFrom(env);
    const store = io.store ?? createCredentialStore({ env });
    const fetch = io.fetch ?? globalThis.fetch;
    const now = io.now ?? Date.now;
    let ui = null;
    const app = {
      env, stdin, json, interactive, baseUrl, store, style, errStyle, now, jsonSuccess,
      version: VERSION,
      columns: stdout.columns ?? 80,
      openUrl: io.openUrl,
      promptContext: io.promptContext,
      out: (text) => stdout.write(`${text}\n`),
      note: (text) => json || stderr.write(`${text}\n`),
      spinner: (text) => (json ? () => {} : startSpinner(stderr, text, errStyle)),
      apiWithToken: (token) => createApi({ baseUrl, token, fetch, now }),
      api: async () => app.apiWithToken((await store.getToken())?.value ?? null),
      ui: () => (ui ??= import('./interactive.js').then((m) => m.createUi(app))),
    };

    if (!command) await (await app.ui()).menu();
    else await (await import('./commands.js')).HANDLERS[command](app, opts, positionals);
    return EXIT_CODES.OK;
  } catch (err) {
    const e = toCliError(err);
    if (json) stdout.write(`${jsonError(command, e)}\n`);
    else stderr.write(e.code === 'INTERRUPTED' ? '\n' : `${formatError(e, errStyle)}\n`);
    return e.exitCode;
  }
}

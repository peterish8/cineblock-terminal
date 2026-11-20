// Where the CLI keeps its secrets and settings.
//
// Secrets (the cb_ CLI token and the optional AI key) are read in this order:
//   1. environment: CINEBLOCK_TOKEN, CINEBLOCK_AI_KEY (never written)
//   2. the OS keychain (Windows Credential Manager, macOS Keychain, Linux Secret Service)
//   3. config.json in the config folder, created with 0600 permissions
// The keychain is used when @napi-rs/keyring loads and works; otherwise the file.
//
// The cb_ token is CineBlock Terminal's own credential. The mcp_ token for
// ChatGPT/Claude is a different credential and is refused here on purpose.
import { mkdir, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CliError } from './errors.js';
import { CLI_TOKEN_PATTERN } from './api.js';

const SERVICE = 'cineblock-terminal';
const SECRETS = {
  token: { account: 'cli-token', env: 'CINEBLOCK_TOKEN', field: 'token' },
  aiKey: { account: 'ai-key', env: 'CINEBLOCK_AI_KEY', field: 'aiKey' },
};

export function configDir(env = process.env, platform = process.platform) {
  if (env.CINEBLOCK_CONFIG_DIR) return env.CINEBLOCK_CONFIG_DIR;
  if (platform === 'win32') return join(env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'cineblock');
  if (platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'cineblock');
  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'cineblock');
}

// Where CineBlock Terminal 1.x (the `conf` package) kept the token and AI key in plain JSON.
function legacyConfigFile(env, platform) {
  if (platform === 'win32') return join(env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'cineblock-cli-nodejs', 'Config', 'config.json');
  if (platform === 'darwin') return join(homedir(), 'Library', 'Preferences', 'cineblock-cli-nodejs', 'config.json');
  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'cineblock-cli-nodejs', 'config.json');
}

/**
 * Check a pasted CLI token before it is stored or sent anywhere.
 * Explains the common mix-up with the MCP token instead of just saying "invalid".
 */
export function validateCliToken(input) {
  const token = String(input ?? '').trim();
  if (token.startsWith('mcp_')) {
    throw new CliError('USAGE', "That's an MCP token. It belongs to the ChatGPT or Claude connector, not the terminal.", {
      hint: 'On cineblock.in, open Profile and copy the CineBlock Terminal token instead. It starts with cb_.',
    });
  }
  if (!CLI_TOKEN_PATTERN.test(token)) {
    throw new CliError('USAGE', "That doesn't look like a CineBlock Terminal token.", {
      hint: 'It starts with cb_ followed by 48 letters and numbers. Copy it again from Profile on cineblock.in.',
    });
  }
  return token;
}

async function loadKeychain() {
  try {
    const { AsyncEntry } = await import('@napi-rs/keyring');
    return {
      get: (account) => new AsyncEntry(SERVICE, account).getPassword(),
      set: (account, value) => new AsyncEntry(SERVICE, account).setPassword(value),
      delete: (account) => new AsyncEntry(SERVICE, account).deletePassword().catch(() => false),
    };
  } catch {
    return null;
  }
}

/**
 * @param {{ env?: NodeJS.ProcessEnv, platform?: string, keychain?: object|null, legacyFile?: string|null }} [options]
 *   Pass `keychain: null` to force file storage (tests do this). `legacyFile` is the
 *   1.x config to migrate; it is skipped when CINEBLOCK_CONFIG_DIR is set.
 */
export function createCredentialStore({
  env = process.env,
  platform = process.platform,
  keychain,
  legacyFile = env.CINEBLOCK_CONFIG_DIR ? null : legacyConfigFile(env, platform),
} = {}) {
  const dir = configDir(env, platform);
  const file = join(dir, 'config.json');
  let keychainPromise = keychain === undefined ? null : Promise.resolve(keychain);
  const getKeychain = () => (keychainPromise ??= loadKeychain());

  async function readConfig() {
    try {
      const data = JSON.parse(await readFile(file, 'utf8'));
      return data && typeof data === 'object' ? data : {};
    } catch {
      return {};
    }
  }

  async function writeConfig(data) {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    await chmod(file, 0o600).catch(() => {});
  }

  async function updateConfig(patch) {
    const next = { ...(await readConfig()), ...patch };
    for (const [k, v] of Object.entries(next)) if (v === undefined || v === null) delete next[k];
    await writeConfig(next);
  }

  // Move secrets from CineBlock Terminal 1.x storage, then delete that plain-text file.
  let migrated = false;
  async function migrateLegacy() {
    if (migrated || !legacyFile) return;
    migrated = true;
    let old;
    try {
      old = JSON.parse(await readFile(legacyFile, 'utf8'));
    } catch {
      return;
    }
    if (typeof old?.cliToken === 'string' && CLI_TOKEN_PATTERN.test(old.cliToken)) await setSecret('token', old.cliToken, { onlyIfEmpty: true });
    if (typeof old?.apiKey === 'string' && old.apiKey.length > 10) await setSecret('aiKey', old.apiKey, { onlyIfEmpty: true });
    await rm(legacyFile, { force: true }).catch(() => {});
  }

  async function readStored(name) {
    const spec = SECRETS[name];
    const kc = await getKeychain();
    if (kc) {
      const value = await kc.get(spec.account).catch(() => null);
      if (value) return { value, source: 'keychain' };
    }
    const config = await readConfig();
    return config[spec.field] ? { value: config[spec.field], source: 'file' } : null;
  }

  async function getSecret(name) {
    const spec = SECRETS[name];
    const fromEnv = env[spec.env]?.trim();
    if (fromEnv) return { value: fromEnv, source: 'env' };
    await migrateLegacy();
    return readStored(name);
  }

  async function setSecret(name, value, { onlyIfEmpty = false } = {}) {
    const spec = SECRETS[name];
    if (onlyIfEmpty && (await readStored(name))) return null;
    const kc = await getKeychain();
    if (kc) {
      try {
        await kc.set(spec.account, value);
        await updateConfig({ [spec.field]: undefined });
        return 'keychain';
      } catch {
        // No usable keychain (for example a headless Linux box): fall back to the file.
      }
    }
    await updateConfig({ [spec.field]: value });
    return 'file';
  }

  async function clearSecret(name) {
    const spec = SECRETS[name];
    const kc = await getKeychain();
    if (kc) await kc.delete(spec.account);
    await updateConfig({ [spec.field]: undefined });
  }

  return {
    configFile: file,
    /** @returns {Promise<{value:string, source:'env'|'keychain'|'file'}|null>} */
    getToken: () => getSecret('token'),
    /** Validates the token format, then stores it. Returns where it went. */
    setToken: (token) => setSecret('token', validateCliToken(token)),
    clearToken: () => clearSecret('token'),
    getAiKey: () => getSecret('aiKey'),
    setAiKey: (key) => setSecret('aiKey', String(key).trim()),
    clearAiKey: () => clearSecret('aiKey'),
  };
}

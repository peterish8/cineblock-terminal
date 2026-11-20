import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCredentialStore, validateCliToken } from '../src/credentials.js';
import { TOKEN } from './helpers.js';

const tempEnv = async () => ({ CINEBLOCK_CONFIG_DIR: await mkdtemp(join(tmpdir(), 'cineblock-test-')) });

test('the MCP token is refused with an explanation, not a generic error', () => {
  assert.throws(() => validateCliToken(`mcp_${'b'.repeat(48)}`), (err) => err.code === 'USAGE' && /MCP token/.test(err.message) && /cb_/.test(err.hint));
  assert.throws(() => validateCliToken('cb_short'), { code: 'USAGE' });
  assert.equal(validateCliToken(`  ${TOKEN}\n`), TOKEN);
});

test('without a keychain the token goes to a private config file', async () => {
  const env = await tempEnv();
  const store = createCredentialStore({ env, keychain: null });
  assert.equal(await store.getToken(), null);
  assert.equal(await store.setToken(TOKEN), 'file');
  assert.deepEqual(await store.getToken(), { value: TOKEN, source: 'file' });
  if (process.platform !== 'win32') assert.equal((await stat(store.configFile)).mode & 0o777, 0o600);
  await store.clearToken();
  assert.equal(await store.getToken(), null);
  assert.ok(!(await readFile(store.configFile, 'utf8')).includes('cb_'));
});

test('environment variables win over saved secrets', async () => {
  const env = { ...(await tempEnv()), CINEBLOCK_TOKEN: `cb_${'c'.repeat(48)}`, CINEBLOCK_AI_KEY: 'gsk_from_env' };
  const store = createCredentialStore({ env, keychain: null });
  await store.setToken(TOKEN);
  assert.equal((await store.getToken()).source, 'env');
  assert.equal((await store.getAiKey()).value, 'gsk_from_env');
});

test('the keychain is preferred and the file keeps no copy', async () => {
  const env = await tempEnv();
  const vault = new Map();
  const keychain = { get: async (a) => vault.get(a) ?? null, set: async (a, v) => { vault.set(a, v); }, delete: async (a) => vault.delete(a) };
  const store = createCredentialStore({ env, keychain });
  assert.equal(await store.setToken(TOKEN), 'keychain');
  assert.equal(vault.get('cli-token'), TOKEN);
  assert.deepEqual(await store.getToken(), { value: TOKEN, source: 'keychain' });
  assert.ok(!existsSync(store.configFile) || !(await readFile(store.configFile, 'utf8')).includes(TOKEN));
});

test('a broken keychain falls back to the file', async () => {
  const env = await tempEnv();
  const keychain = { get: async () => { throw new Error('no dbus'); }, set: async () => { throw new Error('no dbus'); }, delete: async () => false };
  const store = createCredentialStore({ env, keychain });
  assert.equal(await store.setToken(TOKEN), 'file');
  assert.equal((await store.getToken()).value, TOKEN);
});

test('1.x plain-text config is migrated once and deleted', async () => {
  const env = await tempEnv();
  const legacyDir = join(env.CINEBLOCK_CONFIG_DIR, 'legacy');
  await mkdir(legacyDir);
  const legacyFile = join(legacyDir, 'config.json');
  await writeFile(legacyFile, JSON.stringify({ cliToken: TOKEN, apiKey: 'AIzaLegacyKeyLongEnough' }));
  const store = createCredentialStore({ env, keychain: null, legacyFile });
  assert.equal((await store.getToken()).value, TOKEN);
  assert.equal((await store.getAiKey()).value, 'AIzaLegacyKeyLongEnough');
  assert.equal(existsSync(legacyFile), false);
});

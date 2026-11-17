import Conf from 'conf';

const store = new Conf({ projectName: 'cineblock-cli' });

export function detectProvider(key) {
  if (key.startsWith('AIza'))   return 'gemini';
  if (key.startsWith('sk-or-')) return 'openrouter';
  if (key.startsWith('gsk_'))   return 'groq';
  return null;
}

export function getApiKey()    { return store.get('apiKey'); }
export function setApiKey(key) { store.set('apiKey', key); }

export function getCliToken()      { return store.get('cliToken'); }
export function setCliToken(token) { store.set('cliToken', token); }

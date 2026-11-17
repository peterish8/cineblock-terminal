const CLI_API = 'https://cineblock.in/api/cli';
const DAILY_LIMIT = 15;

// Verify token WITHOUT consuming a daily search count.
// Called right after the user pastes their token.
export async function pingToken(cliToken) {
  try {
    const res = await fetch(CLI_API, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${cliToken}` },
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return data; // { ok, name, searchesUsed, searchesRemaining } or { ok: false, error }
  } catch (err) {
    return { ok: false, error: err?.name === 'TimeoutError' ? 'Connection timed out' : 'Network error' };
  }
}

// Validate token AND consume one daily search count.
// Called once per search query.
export async function validateSearch(cliToken) {
  try {
    const res = await fetch(CLI_API, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${cliToken}` },
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return data; // { ok, searchesUsed, searchesRemaining, name } or { ok: false, error }
  } catch (err) {
    // Fail closed: without a successful server validation the CLI must not
    // bypass the token requirement or daily quota.
    return { ok: false, error: err?.name === 'TimeoutError' ? 'Connection timed out' : 'Network error' };
  }
}

export { DAILY_LIMIT };

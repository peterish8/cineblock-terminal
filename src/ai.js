// AI natural-language search with the user's own provider key. The key goes
// straight to the provider and is never sent to CineBlock. This module returns
// candidate titles only; src/api.js verifies them against real CineBlock data.
import { CliError } from './errors.js';

export const PROVIDERS = {
  gemini: { label: 'Gemini', keyPrefix: 'AIza', defaultModel: 'gemini-flash-latest', keyUrl: 'https://aistudio.google.com/apikey' },
  groq: { label: 'Groq', keyPrefix: 'gsk_', defaultModel: 'openai/gpt-oss-120b', keyUrl: 'https://console.groq.com/keys', baseUrl: 'https://api.groq.com/openai/v1' },
  openrouter: { label: 'OpenRouter', keyPrefix: 'sk-or-', defaultModel: 'openai/gpt-oss-120b', keyUrl: 'https://openrouter.ai/keys', baseUrl: 'https://openrouter.ai/api/v1' },
};

/** Guess the provider from the key prefix. Returns null when the key doesn't say. */
export function detectProvider(key) {
  const entry = Object.entries(PROVIDERS).find(([, p]) => String(key ?? '').startsWith(p.keyPrefix));
  return entry ? entry[0] : null;
}

const SYSTEM_PROMPT = `You recommend movies for CineBlock, a movie discovery app.
The user describes what they want to watch in plain language.
Reply with ONLY a JSON array, no markdown and no commentary.
Each item: {"title": string, "year": number, "reason": string}
- "title" is the movie's original release title as listed on TMDB.
- "year" is the theatrical release year.
- "reason" is one short sentence on why it fits the request.
Only real, released feature films. No duplicates. Accurate titles and years.`;

function buildPrompt(query, count, excludeTitles) {
  let prompt = `Recommend ${count} movies for this request:\n${query}`;
  if (excludeTitles.length) {
    prompt += `\n\nThe user has already seen these suggestions, so do not repeat any of them: ${excludeTitles.join('; ')}.`;
  }
  return prompt;
}

/** Pull the movie list out of a model reply, tolerating code fences, prose or a wrapping object. */
export function parseSuggestions(text) {
  const raw = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start === -1 || end <= start) return [];
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return [];
    }
  }
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.movies) ? parsed.movies : [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const title = typeof item?.title === 'string' ? item.title.trim() : '';
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    const year = Number.parseInt(item.year ?? item.release_year, 10);
    out.push({
      title,
      year: Number.isFinite(year) ? year : null,
      reason: typeof item.reason === 'string' && item.reason.trim() ? item.reason.trim() : null,
    });
  }
  return out;
}

async function callProvider({ provider, key, model, prompt, fetch, timeoutMs }) {
  const p = PROVIDERS[provider];
  const request = provider === 'gemini'
    ? {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: {
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.9 },
        },
      }
    : {
        url: `${p.baseUrl}/chat/completions`,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: {
          model,
          temperature: 0.9,
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
        },
      };

  let res;
  try {
    res = await fetch(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body), signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw new CliError('AI_PROVIDER', timedOut ? `${p.label} took too long to answer.` : `Couldn't reach ${p.label}.`, {
      hint: 'Check your connection and try again, or use guided search, which needs no AI key.',
    });
  }

  if (!res.ok) {
    const status = res.status;
    if (status === 401 || status === 403 || (status === 400 && provider === 'gemini')) {
      throw new CliError('AI_PROVIDER', `${p.label} didn't accept your API key.`, { hint: `Get a key at ${p.keyUrl}, then run \`cineblock ai-key\`.` });
    }
    if (status === 404) {
      throw new CliError('AI_PROVIDER', `${p.label} doesn't offer the model "${model}" to your key.`, { hint: 'Pick another one with --model or CINEBLOCK_AI_MODEL.' });
    }
    if (status === 402 || status === 429) {
      throw new CliError('AI_PROVIDER', `${p.label} is out of credit or rate limiting your key.`, { hint: 'Wait a little and retry, or use guided search, which needs no AI key.' });
    }
    throw new CliError('AI_PROVIDER', `${p.label} had a problem answering (${status}).`, { hint: 'Try again in a moment.' });
  }

  const data = await res.json().catch(() => null);
  return provider === 'gemini'
    ? (data?.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('')
    : data?.choices?.[0]?.message?.content ?? '';
}

/**
 * Ask the user's AI provider for movie ideas.
 * @returns {Promise<{title:string, year:number|null, reason:string|null}[]>}
 */
export async function suggestTitles(query, { key, model, excludeTitles = [], count = 8, fetch = globalThis.fetch, timeoutMs = 60_000 } = {}) {
  if (!key) {
    throw new CliError('AI_KEY_MISSING', 'AI search needs your own Gemini, Groq or OpenRouter API key.', {
      hint: 'Add one with `cineblock ai-key`, or set CINEBLOCK_AI_KEY. Guided search works without a key.',
    });
  }
  const name = detectProvider(key);
  if (!name) {
    throw new CliError('AI_KEY_MISSING', "That AI key isn't from Gemini, Groq or OpenRouter.", {
      hint: 'Gemini keys start with AIza, Groq with gsk_, OpenRouter with sk-or-. Save one with `cineblock ai-key`.',
    });
  }
  const text = await callProvider({
    provider: name,
    key,
    model: model || PROVIDERS[name].defaultModel,
    prompt: buildPrompt(query, count, excludeTitles),
    fetch,
    timeoutMs,
  });
  return parseSuggestions(text);
}

import { callGemini }      from './gemini.js';
import { callOpenRouter }  from './openrouter.js';
import { callGroq }        from './groq.js';

export const SYSTEM_PROMPT = `You are a movie recommendation engine for CineBlock.
The user will describe movies they want to find using natural language.
Respond with ONLY a valid raw JSON array. No markdown. No code fences. No explanation.
Return exactly 15 unique movies matching the description.

Each object must use this exact schema:
{
  "title": "string",
  "release_year": number,
  "reason": "1 sentence why this fits",
  "genres": ["Vibe-genre 1", "Vibe-genre 2"]
}

Respond with rich, specific genres (e.g. 'Neon-Noir', 'Space Opera') instead of just 'Action'.
Do not invent fictional movies. Use accurate titles and release years.`;

function extractJsonArray(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty response received from AI provider');
  }
  const cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      return JSON.parse(cleaned.slice(firstBracket, lastBracket + 1));
    }
    throw new Error('Response did not contain a valid JSON array');
  }
}

export async function getVerifiedMovie(query, apiKey, excludedTitles = []) {
  let provider = null;
  if (apiKey.startsWith('AIza')) provider = 'gemini';
  else if (apiKey.startsWith('gsk_')) provider = 'groq';
  else provider = 'openrouter';

  let fullQuery = query;
  if (excludedTitles.length > 0) {
    fullQuery += `\n\nIMPORTANT: Do NOT suggest any of these already-shown movies: ${excludedTitles.join(', ')}. Pick completely different films.`;
  }

  let raw;
  if (provider === 'gemini')          raw = await callGemini(fullQuery, apiKey);
  else if (provider === 'openrouter') raw = await callOpenRouter(fullQuery, apiKey);
  else if (provider === 'groq')       raw = await callGroq(fullQuery, apiKey);
  else throw new Error(`Unknown provider: ${provider}`);

  const movies = extractJsonArray(raw);
  if (!Array.isArray(movies)) throw new Error('Response was not a JSON array');
  return movies;
}

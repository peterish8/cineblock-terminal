import OpenAI from 'openai';
import { SYSTEM_PROMPT } from './ai.js';

export async function callOpenRouter(query, apiKey) {
  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
  });
  const res = await client.chat.completions.create({
    model: 'google/gemini-2.0-flash-001',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: query },
    ],
  });
  return res.choices[0].message.content.trim().replace(/```json|```/g, '').trim();
}

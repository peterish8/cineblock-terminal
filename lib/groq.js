import OpenAI from 'openai';
import { SYSTEM_PROMPT } from './ai.js';

export async function callGroq(query, apiKey) {
  const client = new OpenAI({
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey,
  });
  const res = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: query },
    ],
  });
  return res.choices[0].message.content.trim().replace(/```json|```/g, '').trim();
}

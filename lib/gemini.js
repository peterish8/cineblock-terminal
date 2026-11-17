import { GoogleGenerativeAI } from '@google/generative-ai';
import { SYSTEM_PROMPT } from './ai.js';

export async function callGemini(query, apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  // Using gemini-1.5-flash as it's the most stable/fast for this
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: SYSTEM_PROMPT });
  
  const result = await model.generateContent(query);
  const response = await result.response;
  return response.text().trim().replace(/```json|```/g, '').trim();
}

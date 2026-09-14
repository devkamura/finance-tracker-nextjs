import "server-only";

import { GoogleGenAI } from "@google/genai";

let cachedClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!cachedClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEYが設定されていません。");
    }
    cachedClient = new GoogleGenAI({ apiKey });
  }
  return cachedClient;
}

import OpenAI from "openai";
import { config } from "../config.js";

export const llmClient = new OpenAI({
  apiKey: config.openRouterApiKey,
  baseURL: "https://openrouter.ai/api/v1",
});

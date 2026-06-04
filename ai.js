// ai.js
// Handles all AI responses — defaults to Gemini, can switch to Claude

require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const UMRAH_KNOWLEDGE = require('./knowledge');

const provider = process.env.AI_PROVIDER || 'gemini';
console.log(`🤖 AI Provider active: ${provider.toUpperCase()}`);

// ── Gemini setup ──────────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const geminiModel = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  systemInstruction: UMRAH_KNOWLEDGE,
  generationConfig: {
    maxOutputTokens: 1024,
    temperature: 0.7,       // 0 = very predictable, 1 = more creative
  }
});

// ── Convert our history format to Gemini's format ─────────────────────────────
// Our format:  { role: 'assistant', content: 'Hello' }
// Gemini wants: { role: 'model', parts: [{ text: 'Hello' }] }
function convertHistoryForGemini(history) {
  return history.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));
}

// ── Main function — called by index.js for every incoming message ─────────────
async function getAIResponse(conversationHistory, newUserMessage) {
  try {
    if (provider === 'gemini') {
      return await askGemini(conversationHistory, newUserMessage);
    }

    // Fallback error if provider not recognized
    throw new Error(`Unknown AI provider: ${provider}`);

  } catch (error) {
    console.error(`❌ AI error:`, error.message);

    // Send a friendly fallback message to the customer
    return 'Sorry, I am having a small technical issue right now. ' +
           'Please try again in a moment, or call us directly at ' +
           '+92-300-1234567. JazakAllah Khair!';
  }
}

// ── Gemini response function ──────────────────────────────────────────────────
async function askGemini(history, userMessage) {
  // Start a chat session with the existing conversation history
  const chat = geminiModel.startChat({
    history: convertHistoryForGemini(history)
  });

  // Send the new message and wait for response
  const result = await chat.sendMessage(userMessage);
  const response = await result.response;
  const text = response.text();

  if (!text || text.trim() === '') {
    throw new Error('Gemini returned empty response');
  }

  return text.trim();
}

module.exports = { getAIResponse };
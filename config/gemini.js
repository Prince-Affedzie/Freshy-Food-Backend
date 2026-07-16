// config/gemini.js
const { GoogleGenAI } = require("@google/genai");

// Automatically loads the process.env.GEMINI_API_KEY variable
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});


module.exports = ai;

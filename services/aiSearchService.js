// services/aiSearchService.js
const ai = require("../config/gemini");
const { Type } = require("@google/genai"); // Import native types for clean tool schemas
const { CATEGORIES, SUBCATEGORIES, CONDITIONS } = require("../schemas/searchIntentSchema");

// Declare the tool so Gemini understands how it can search your database
const searchProductsTool = {
  name: "searchCediMartDatabase",
  description: "Queries the live CediMart MongoDB inventory for campus products based on conversational filters.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      searchTerm: { 
        type: Type.STRING, 
        description: "An optimized, expanded string combining synonyms or keywords for text matching (e.g. 'desk table learning desk')." 
      },
      category: { 
        type: Type.STRING, 
        enum: [...CATEGORIES, "none"],
        description: "The primary product category if implied. Use 'none' if uncertain." 
      },
      subcategory: { 
        type: Type.STRING, 
        enum: [...SUBCATEGORIES, "none"], // Matches your full newly generated array!
        description: "The specific subcategory ID (e.g., 'shoes', 'past-questions', 'laptop-bags', 'fans'). Use 'none' if uncertain." 
      },
      priceMax: { type: Type.NUMBER, description: "Maximum price budget in GHS if provided or heavily implied by phrases like 'cheap' or 'under X'." },
      priceMin: { type: Type.NUMBER, description: "Minimum price budget in GHS if specified." },
      condition: { type: Type.STRING, enum: [...CONDITIONS, "none"] },
    },
    required: ["searchTerm"]
  }
};

const SYSTEM_PROMPT = `You are CediMart's smart, witty student shopping assistant for a Ghanaian campus marketplace.
Your goal is to help students find products by invoking the database search tool.

Rules:
1. Always call the 'searchCediMartDatabase' tool when a user is looking for items to buy.
2. If the user query is generic or uses student slang, translate that into an excellent descriptive 'searchTerm'.
   CRITICAL: Do not append completely different product types or categories as synonyms (e.g., if searching for shoes, DO NOT include the word "dress" on its own; keep terms tightly coupled).
3. Upon receiving database results, format your response STRICTLY as follows:

   --- START OF FORMAT ---
   ✨ Ask CediAI
   
   [A brief, friendly, and professional 2-3 sentence summary of the best matches found, explaining why a specific item is a great pick based on features, condition, or price.]
   
   
   
   [A single, engaging follow-up question offering directions for narrowing down the search, e.g., "Would you like something lighter, more powerful, or cheaper?"]
   --- END OF FORMAT ---

4. Keep the summary highly accurate to the retrieved data. Do not fabricate or alter any items, services, or pricing.
5. Reference active session context for any follow-up inquiries. If details are missing, state that clearly instead of speculating.
`;
/**
 * Executes the initial agent request to see if it wants to search the database.
 */
async function runSearchAgent(query, campusContext) {
  const response = await ai.models.generateContent({
    model: process.env.AI_SUMMARY_MODEL,
    contents: `User Campus: ${campusContext || "All campuses"}\nStudent Query: "${query}"`,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.5,
      tools: [{ functionDeclarations: [searchProductsTool] }], // Provide the tool
    },
  });

  return response;
}

/**
 * Second Turn: Send the real Mongo results back to Gemini to produce the final clever response.
 */
async function generateFinalResponse(originalQuery, originalResponse, dbResults) {
  const response = await ai.models.generateContent({
    model:process.env.AI_SEARCH_MODEL,
    contents: [
      { role: 'user', parts: [{ text: originalQuery }] },
      originalResponse.candidates[0].content, // Pass the tool call turn back
      {
        role: 'user',
        parts: [{
          // Provide function response data back using the model pattern
          text: `Function response from searchCediMartDatabase: ${JSON.stringify(dbResults)}. Total records found: ${dbResults.length}. Now draft your helpful response to the student.`
        }]
      }
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.7,
    }
  });

  return response.text;
}

module.exports = { runSearchAgent, generateFinalResponse };
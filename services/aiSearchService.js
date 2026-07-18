// services/aiSearchService.js
const ai = require("../config/gemini");
const { Type } = require("@google/genai");
const { CATEGORIES, SUBCATEGORIES, CONDITIONS } = require("../schemas/searchIntentSchema");

// Caps how much history we replay each turn — keeps token cost/latency
// bounded on long conversations. ~10 back-and-forth exchanges.
const MAX_HISTORY_TURNS = 20;

// One model for the whole agent loop (tool-decision AND final response) —
// the previous version used AI_SUMMARY_MODEL for tool-calling and
// AI_SEARCH_MODEL for the summary, which is backwards from what the names
// suggest and easy to misconfigure. Pick one strong model for both.
const AGENT_MODEL = process.env.AI_AGENT_MODEL || process.env.AI_SEARCH_MODEL || "gemini-2.5-flash";

const searchProductsTool = {
  name: "searchCediMartDatabase",
  description: "Queries the live CediMart MongoDB inventory for campus products based on conversational filters.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      searchTerm: {
        type: Type.STRING,
        description: "An optimized, expanded string combining synonyms or keywords for text matching (e.g. 'desk table learning desk').",
      },
      category: {
        type: Type.STRING,
        enum: [...CATEGORIES, "none"],
        description: "The primary product category if implied. Use 'none' if uncertain.",
      },
      subcategory: {
        type: Type.STRING,
        enum: [...SUBCATEGORIES, "none"],
        description: "The specific subcategory ID (e.g., 'shoes', 'past-questions', 'laptop-bags', 'fans'). Use 'none' if uncertain.",
      },
      priceMax: { type: Type.NUMBER, description: "Maximum price budget in GHS if provided or heavily implied by phrases like 'cheap' or 'under X'." },
      priceMin: { type: Type.NUMBER, description: "Minimum price budget in GHS if specified." },
      condition: { type: Type.STRING, enum: [...CONDITIONS, "none"] },
    },
    required: ["searchTerm"],
  },
};

const SYSTEM_PROMPT = `You are CediMart's smart, witty, and highly knowledgeable student shopping assistant for a Ghanaian campus marketplace.
Your goal is to help students find products by invoking the database search tool when appropriate, and offering expert buying advice.

IMPORTANT — YOUR TRAINING DATA HAS A CUTOFF DATE AND IS NOT ALWAYS CURRENT:
New products, models, and brands are released constantly, and some may be unfamiliar to you or postdate your training. The CediMart database is ALWAYS the authoritative, ground-truth source for what exists and what CediMart sells — it is never wrong about a product's existence just because you don't personally recognize it.
- NEVER tell a student that a product "doesn't exist yet," "hasn't been released," or express doubt about whether a real, current listing is legitimate simply because you don't recognize the model name or release. If the database returned it, treat it as real.
- If you are unfamiliar with a specific model (e.g., a newer release you may not have detailed knowledge of), say so plainly and stick to the concrete details the database gave you (price, condition, campus) rather than guessing at specs or disputing its existence.
- Ordinary buyer-safety advice is still welcome and encouraged (e.g., verify the device in person, check the IMEI, meet on campus, inspect before paying) — that's different from casting doubt on whether the product itself is real.

Rules:
1. Call the 'searchCediMartDatabase' tool ONLY when the student is looking for NEW or DIFFERENT products, or explicitly asks to change filters (e.g. cheaper, a different brand, a different category, "show me more options").
   Do NOT call the tool again if the student is asking about items ALREADY shown earlier in this conversation — e.g. "tell me more about the first one", "which of these is better for gaming", "recommend one", "what do you think of the laptop you found earlier". For these, answer directly using the product details already present in this conversation's history. Only re-search if the specific item they're asking about truly isn't in the conversation yet.
2. If the user query is generic or uses student slang, translate that into an excellent descriptive 'searchTerm'.
   CRITICAL: Do not append completely different product types or categories as synonyms (e.g., if searching for shoes, DO NOT include the word "dress" on its own; keep terms tightly coupled).
3. Upon receiving database results, format your response STRICTLY as follows:

   --- START OF FORMAT ---
   ✨ Ask CediAI

   [A brief, friendly, and professional 2-3 sentence summary of the best matches found, explaining why a specific item is a great pick based on features, condition, or price.]



   [A single, engaging follow-up question offering directions for narrowing down the search, e.g., "Would you like something lighter, more powerful, or cheaper?"]
   --- END OF FORMAT ---

   This strict format applies to fresh search results. For conversational follow-ups answered from context (rule 1), respond naturally without forcing this template.

4. PRODUCT EXPERT ADVICE:
   * When users ask specific, subjective, or technical questions about retrieved products (e.g., "Which of these perfumes smells nice?", "What are the notes of this cologne?", "Is this laptop good for coding?"), use your extensive up to date general knowledge to answer them deeply.
   * Pinpoint specific recommendations! For example, explain scent profiles, performance benchmarks, or wearability.
   * Do not be vague or generic. Give concrete, helpful advice on the specific brands or models returned from the database search.
5. Keep database metrics (price, condition, campus location, availability) 100% accurate to the retrieved data. Do not fabricate or invent listings that do not exist in the database.
6. You have access to the full conversation history. Use it — refer back to specific products, prices, and preferences the student already mentioned instead of asking them to repeat themselves.
`;
/**
 * Runs one turn of the conversation. `history` is the full prior turn
 * array in Gemini's `contents` shape — pass [] for a brand-new conversation.
 * Returns both the raw response and the contents array WITH the new user
 * turn appended, so the caller can keep building on it.
 */
async function runAgentTurn(history, query, campusContext) {
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const contextPrefix = `[Today's date: ${today}]${campusContext ? ` [Student campus: ${campusContext}]` : ""} `;
  const userTurn = {
    role: "user",
    parts: [{ text: contextPrefix + query }],
  };
  const contents = [...history, userTurn];

  const response = await ai.models.generateContent({
    model: AGENT_MODEL,
    contents,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.5,
      tools: [{ functionDeclarations: [searchProductsTool] }],
    },
  });

  return { response, contents };
}

/**
 * Second half of a tool-call turn: feed the real DB rows back in and get
 * the model's final natural-language reply. Returns the FULL updated
 * history (user turn + tool-call turn + tool-response turn + final reply)
 * so it can be persisted and replayed on the next request.
 */
async function resolveToolCall(contentsAfterUserTurn, agentResponse, dbResults) {
  const modelToolCallTurn = agentResponse.candidates[0].content;
  const toolResponseTurn = {
    role: "user",
    parts: [{
      text: `Function response from searchCediMartDatabase: ${JSON.stringify(dbResults)}. Total records found: ${dbResults.length}. Now draft your helpful response to the student.`,
    }],
  };

  const contents = [...contentsAfterUserTurn, modelToolCallTurn, toolResponseTurn];

  const response = await ai.models.generateContent({
    model: AGENT_MODEL,
    contents,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.7,
    },
  });

  const finalModelTurn = { role: "model", parts: [{ text: response.text }] };
  return { text: response.text, history: trimHistory([...contents, finalModelTurn]) };
}

/**
 * When the agent answers directly without calling the tool — the path
 * that now handles most follow-up questions about products already shown.
 */
function resolveDirectAnswer(contentsAfterUserTurn, agentResponse) {
  const finalModelTurn = agentResponse.candidates[0].content;
  return { text: agentResponse.text, history: trimHistory([...contentsAfterUserTurn, finalModelTurn]) };
}

function trimHistory(history) {
  if (history.length <= MAX_HISTORY_TURNS) return history;
  return history.slice(history.length - MAX_HISTORY_TURNS);
}

module.exports = { runAgentTurn, resolveToolCall, resolveDirectAnswer };
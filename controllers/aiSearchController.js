// controllers/aiSearchController.js
const crypto = require("crypto");
const { randomUUID } = require("crypto");
const Product = require("../model/Product");
const redis = require("../config/redis");
const { runAgentTurn, resolveToolCall, resolveDirectAnswer } = require("../services/aiSearchService");
const rankResults = require("../Utils/rankResults");
const {generateProductDetails} = require("../services/aiProductDetailsGenerator")
const fs = require("fs");

const SESSION_TTL_SECONDS = 30 * 60; // 30 min of inactivity clears conversation context

const aiSearch = async (req, res) => {
  const { query, conversationId: incomingConversationId } = req.body;
  const campus = req.query.campus || null;

  if (!query || typeof query !== "string" || query.trim().length < 3) {
    return res.status(400).json({ success: false, message: "Please enter a valid search query." });
  }

  // Every conversation gets its own id so follow-ups can find their history.
  // IMPORTANT: the old cache key was just `query + campus` — that's actually
  // unsafe once follow-ups exist, since "tell me more" means something
  // completely different per conversation. Two different students (or the
  // same student in two separate chats) typing that phrase would have
  // gotten back a stale, unrelated cached answer. Scoping the cache to the
  // conversation fixes that.
  const conversationId = incomingConversationId || randomUUID();
  const sessionKey = `ai_session:${conversationId}`;
  const cacheKey = `ai_agent_search:${conversationId}:${crypto
    .createHash("md5")
    .update(query.trim().toLowerCase())
    .digest("hex")}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return res.status(200).json(JSON.parse(cached));

    const rawHistory = await redis.get(sessionKey);
    const history = rawHistory ? JSON.parse(rawHistory) : [];

    const { response: agentResponse, contents } = await runAgentTurn(history, query, campus);

    let finalPayload;

    if (agentResponse.functionCalls && agentResponse.functionCalls.length > 0) {
      const args = agentResponse.functionCalls[0].args;
      console.log("Gemini parsed arguments:", args);

      let filter = { isAvailable: true };
      if (args.searchTerm) filter.$text = { $search: args.searchTerm };
      if (args.category && args.category !== "none") filter.category = args.category;
      if (args.subcategory && args.subcategory !== "none") filter.subcategory = args.subcategory;
      if (campus) filter.campus = campus;
      if (args.priceMax || args.priceMin) {
        filter.price = {};
        if (args.priceMax) filter.price.$lte = args.priceMax;
        if (args.priceMin) filter.price.$gte = args.priceMin;
      }

      let products = await Product.find(filter).limit(30).lean();
      if (products.length === 0 && filter.$text) {
        const { $text, ...relaxedFilter } = filter;
        products = await Product.find(relaxedFilter).limit(30).lean();
      }

      const rankingIntent = { ...args, query: args.searchTerm || query };
      const rankedMatches = rankResults(products, rankingIntent).slice(0, 15);
      

      const minimizedDbResult = rankedMatches.map((p) => ({
        id: p._id,
        name: p.name,
        price: `GHS ${p.price}`,
        condition: p.condition,
        campus: p.campus,
      }));

      const { text, history: updatedHistory } = await resolveToolCall(contents, agentResponse, minimizedDbResult);
      await redis.set(sessionKey, JSON.stringify(updatedHistory), "EX", SESSION_TTL_SECONDS);

      finalPayload = {
        success: true,
        conversationId,
        query,
        aiResponse: text,
        count: rankedMatches.length,
        results: rankedMatches,
      };
    } else {
      // No tool call — this is now the normal path for follow-up questions
      // about products already shown earlier in the conversation.
      const { text, history: updatedHistory } = resolveDirectAnswer(contents, agentResponse);
      await redis.set(sessionKey, JSON.stringify(updatedHistory), "EX", SESSION_TTL_SECONDS);

      finalPayload = {
        success: true,
        conversationId,
        query,
        aiResponse: text,
        count: 0,
        results: [],
      };
    }

    // Short-TTL cache scoped to this exact conversation — mainly guards
    // against accidental rapid double-submits, not a broad cross-user
    // cache anymore since answers are now conversation-dependent.
    await redis.set(cacheKey, JSON.stringify(finalPayload), "EX", 120);
    return res.status(200).json(finalPayload);
  } catch (err) {
    console.error("Agent Search Error:", err);
    return res.status(500).json({
      success: false,
      message: "Search is temporarily down—try browsing categories!",
    });
  }
};


const analyzeProductImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: "Please upload a product image." 
      });
    }

    
    const imageBuffer = req.file.buffer;
    const mimeType = req.file.mimetype;

    const productData = await generateProductDetails(imageBuffer, mimeType);

    // Return the clean JSON
    return res.status(200).json({
      success: true,
      data: productData
    });

  } catch (error) {
    console.error("Controller Error in analyzeProductImage:", error);
    
    
    return res.status(500).json({
      success: false,
      message: "Failed to analyze image with AI.",
      error: error.message
    });
  }
};

module.exports = { aiSearch,analyzeProductImage };
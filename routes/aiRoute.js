const express = require("express");
const rateLimit = require("express-rate-limit");
const aiRouter = express.Router();
const { aiSearch } = require("../controllers/aiSearchController");

// Guest-friendly (no auth required) but rate-limited — an LLM-backed
// endpoint with no login wall is a real cost/abuse vector.
const aiSearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  message: { success: false, message: "Too many searches — please wait a moment." },
});

aiRouter.post("/ai/i/search", aiSearchLimiter, aiSearch);

module.exports = aiRouter;
const express = require("express");
const rateLimit = require("express-rate-limit");
const aiRouter = express.Router();
const { aiSearch,analyzeProductImage } = require("../controllers/aiSearchController");
const { upload } = require('../Utils/mutlerConfig');


// Guest-friendly (no auth required) but rate-limited — an LLM-backed
// endpoint with no login wall is a real cost/abuse vector.
const aiSearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  message: { success: false, message: "Too many searches — please wait a moment." },
});

aiRouter.post("/ai/i/search", aiSearchLimiter, aiSearch);
aiRouter.post("/ai/i/anayze_image",aiSearchLimiter,upload.single('productImage'),analyzeProductImage)

module.exports = aiRouter;
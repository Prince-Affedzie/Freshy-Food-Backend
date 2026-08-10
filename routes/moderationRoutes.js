// routes/moderationRoutes.js
const express = require("express");
const moderationRoute = express.Router();

const { submitReportHandler } = require("../controllers/reportController");
const { listQueue, getContentReports, resolve, stats } = require("../controllers/moderationController");
const { auth } = require("../middleware/auth"); // adjust to your actual auth middleware
const { requireModerator } = require("../middleware/requireModerator");

// ── User-facing ─────────────────────────────────────────────────────────
moderationRoute.post("/reports", auth, submitReportHandler);

// ── Moderator-facing ────────────────────────────────────────────────────
moderationRoute.get("/moderation/queue", auth, requireModerator, listQueue);
moderationRoute.get("/moderation/content/:contentType/:contentId",  auth, requireModerator, getContentReports);
moderationRoute.post("/moderation/resolve",auth, requireModerator, resolve);
moderationRoute.get("/moderation/stats",auth, requireModerator, stats);

module.exports = moderationRoute;
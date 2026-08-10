// controllers/moderationController.js
const {
  getModerationQueue,
  getReportsForContent,
  resolveReport,
  getModerationStats,
} = require("../services/moderation");
const { CONTENT_TYPES } = require("../model/Report");

const listQueue = async (req, res) => {
  try {
    const { contentType, page = 1, limit = 20 } = req.query;

    if (contentType && !CONTENT_TYPES.includes(contentType)) {
      return res.status(400).json({ success: false, message: "Invalid content type" });
    }

    const { items, total } = await getModerationQueue({
      contentType,
      page: Number(page),
      limit: Number(limit),
    });

    res.status(200).json({
      success: true,
      data: { items, pagination: { page: Number(page), totalPages: Math.ceil(total / limit), total } },
    });
  } catch (err) {
    console.error("listQueue error:", err);
    res.status(500).json({ success: false, message: "Failed to load moderation queue" });
  }
};

const getContentReports = async (req, res) => {
  try {
    const { contentType, contentId } = req.params;
    if (!CONTENT_TYPES.includes(contentType)) {
      return res.status(400).json({ success: false, message: "Invalid content type" });
    }
    const reports = await getReportsForContent(contentType, contentId);
    res.status(200).json({ success: true, data: reports });
  } catch (err) {
    console.error("getContentReports error:", err);
    res.status(500).json({ success: false, message: "Failed to load reports" });
  }
};

const resolve = async (req, res) => {
  try {
    const { contentType, contentId, decision, moderatorNote } = req.body;

    if (!CONTENT_TYPES.includes(contentType)) {
      return res.status(400).json({ success: false, message: "Invalid content type" });
    }
    if (!contentId || !decision) {
      return res.status(400).json({ success: false, message: "contentId and decision are required" });
    }

    const result = await resolveReport({
      contentType,
      contentId,
      decision,
      moderatorId: req.user.id || req.user._id,
      moderatorNote,
    });

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status === 500) console.error("resolve error:", err);
    res.status(status).json({ success: false, message: err.message || "Failed to resolve report" });
  }
};

const stats = async (req, res) => {
  try {
    const data = await getModerationStats();
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error("stats error:", err);
    res.status(500).json({ success: false, message: "Failed to load moderation stats" });
  }
};

module.exports = { listQueue, getContentReports, resolve, stats };
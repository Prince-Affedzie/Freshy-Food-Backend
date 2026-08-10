// controllers/reportController.js
const { submitReport } = require("../services/moderation");
const { REPORT_REASONS, CONTENT_TYPES } = require("../model/Report");

const submitReportHandler = async (req, res) => {
  try {
    const { contentType, contentId, reason, description } = req.body;

    if (!CONTENT_TYPES.includes(contentType)) {
      return res.status(400).json({ success: false, message: "Invalid content type" });
    }
    if (!REPORT_REASONS.includes(reason)) {
      return res.status(400).json({ success: false, message: "Invalid report reason" });
    }
    if (!contentId) {
      return res.status(400).json({ success: false, message: "contentId is required" });
    }
    if (description && description.length > 500) {
      return res.status(400).json({ success: false, message: "Description must be 500 characters or less" });
    }

    const report = await submitReport({
      reporterId: req.user.id || req.user._id,
      contentType,
      contentId,
      reason,
      description,
    });

    res.status(201).json({
      success: true,
      data: { reportId: report._id },
      message: "Thanks for the report — our team will review it.",
    });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status === 500) console.error("submitReportHandler error:", err);
    res.status(status).json({ success: false, message: err.message || "Failed to submit report" });
  }
};

module.exports = { submitReportHandler };
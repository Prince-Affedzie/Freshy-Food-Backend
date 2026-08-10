// models/Report.js
const mongoose = require("mongoose");

const REPORT_REASONS = [
  "spam",
  "harassment",
  "hate_speech",
  "violence",
  "sexual_content",
  "scam_fraud",
  "misinformation",
  "self_harm",
  "other",
];

const CONTENT_TYPES = ["FeedPost", "ChatMessage", "Comment", "User"];

const ReportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // Polymorphic reference — works for a feed post, a chat message, a
    // comment, or a user profile without needing a separate Report model
    // per content type.
    contentType: { type: String, enum: CONTENT_TYPES, required: true },
    contentId: { type: mongoose.Schema.Types.ObjectId, required: true },

    // Denormalized snapshot taken at report time. Content can be edited or
    // deleted later — moderators still need to see what was actually
    // reported, so we don't rely on being able to re-fetch it live.
    snapshot: {
      preview: { type: String, default: null }, // e.g. post title, message text (truncated)
      authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      mediaUrl: { type: String, default: null },
    },

    reason: { type: String, enum: REPORT_REASONS, required: true },
    description: { type: String, maxlength: 500, default: null },

    status: {
      type: String,
      enum: ["pending", "reviewing", "resolved", "dismissed"],
      default: "pending",
      index: true,
    },

    moderator: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    moderatorNote: { type: String, default: null },
    actionTaken: {
      type: String,
      enum: ["none", "content_removed", "user_warned", "user_suspended", "user_banned"],
      default: "none",
    },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One report per user per piece of content — resubmitting isn't a way to
// pile on, and this also gives a clean, cheap "already reported" check.
ReportSchema.index({ reporter: 1, contentType: 1, contentId: 1 }, { unique: true });

// Fast lookup for "how many pending reports does this content have" and
// for the grouped moderation queue view.
ReportSchema.index({ contentType: 1, contentId: 1, status: 1 });

module.exports = mongoose.model("Report", ReportSchema);
module.exports.REPORT_REASONS = REPORT_REASONS;
module.exports.CONTENT_TYPES = CONTENT_TYPES;
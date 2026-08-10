// services/moderation.js
const mongoose = require("mongoose");
const Report = require("../model/Report");

// Distinct users reporting the same content before it's auto-hidden
// pending review — a community signal, not a final judgment. Tune this
// based on your actual traffic; too low invites brigading, too high means
// bad content sits visible too long.
const AUTO_FLAG_THRESHOLD = 5;

const SUSPENSION_DAYS = 7;

// ─── Content-type adapters ─────────────────────────────────────────────────
// Each content type has different field names for "author" and "hide this".
// FeedPost is filled in based on the model built earlier in this project.
// ChatMessage/Comment are best-guess field names — confirm against your
// actual schemas and adjust getAuthorField / hideContent / removeContent
// below if they differ. This is the one place that needs your input.
const CONTENT_ADAPTERS = {
  FeedPost: {
    model: () => require("../model/FeedPost"),
    getAuthorField: () => "author",
    getPreview: (doc) => doc.title || doc.description?.slice(0, 80) || "(feed post)",
    getMediaUrl: (doc) => doc.media?.[0]?.url || doc.media?.[0]?.thumbnailUrl || null,
    // Auto-flag: reuse the existing status field so it's automatically
    // excluded by getFeed's `status: 'approved'` filter — no schema change needed.
    hide: async (doc) => { doc.status = "under_review"; await doc.save(); },
    remove: async (doc) => { doc.status = "removed"; await doc.save(); },
  },
  ChatMessage: {
    // ADAPT ME: confirm this path and field names against your actual model.
    model: () => require("../model/Message"),
    getAuthorField: () => "sender",
    getConversation: (doc) => (doc.conversation || null),
    getPreview: (doc) => (doc.text || "").slice(0, 80) || "(message)",
    getMediaUrl: (doc) => doc.attachmentUrl || null,
    hide: async (doc) => { doc.isFlagged = true; await doc.save(); },
    remove: async (doc) => { doc.isDeleted = true; doc.text = "[removed by moderator]"; await doc.save(); },
  },
  Comment: {
    // ADAPT ME if you have a separate Comment model for feed posts.
    model: () => require("../model/Comment"),
    getAuthorField: () => "author",
    getPreview: (doc) => (doc.text || "").slice(0, 80) || "(comment)",
    getMediaUrl: () => null,
    hide: async (doc) => { doc.isFlagged = true; await doc.save(); },
    remove: async (doc) => { doc.isDeleted = true; await doc.save(); },
  },
};

const getAdapter = (contentType) => {
  const adapter = CONTENT_ADAPTERS[contentType];
  if (!adapter) throw new Error(`Unsupported content type: ${contentType}`);
  return adapter;
};

// ─── Submit a report ────────────────────────────────────────────────────────
const submitReport = async ({ reporterId, contentType, contentId, reason, description }) => {
  const adapter = getAdapter(contentType);
  const Model = adapter.model();

  const content = await Model.findById(contentId);
  if (!content) {
    const err = new Error("Content not found");
    err.statusCode = 404;
    throw err;
  }

  const authorId = content[adapter.getAuthorField()];
  if (authorId && String(authorId) === String(reporterId)) {
    const err = new Error("You can't report your own content");
    err.statusCode = 400;
    throw err;
  }

  let report;
  try {
    report = await Report.create({
      reporter: reporterId,
      contentType,
      contentId,
      reason,
      description: description || null,
      snapshot: {
        preview: adapter.getPreview(content),
        authorId: authorId || null,
        mediaUrl: adapter.getMediaUrl(content),
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      const dup = new Error("You've already reported this");
      dup.statusCode = 409;
      throw dup;
    }
    throw err;
  }

  const pendingCount = await Report.countDocuments({
    contentType,
    contentId,
    status: { $in: ["pending", "reviewing"] },
  });

  if (pendingCount >= AUTO_FLAG_THRESHOLD) {
    await adapter.hide(content);
    // TODO: notify moderators (push notification / Slack webhook / email) —
    // stubbed as a log for now so this doesn't silently do nothing.
    console.log(`🚩 Auto-flagged ${contentType} ${contentId} after ${pendingCount} reports`);
  }

  return report;
};

// ─── Grouped queue for moderators ──────────────────────────────────────────
// Groups pending/reviewing reports by content item, rather than showing one
// row per report — a post with 6 reports should be one queue item, not 6.
const getModerationQueue = async ({ contentType, page = 1, limit = 20 }) => {
  const match = { status: { $in: ["pending", "reviewing"] } };
  if (contentType) match.contentType = contentType;

  const skip = (page - 1) * limit;

  const grouped = await Report.aggregate([
    { $match: match },
    {
      $group: {
        _id: { contentType: "$contentType", contentId: "$contentId" },
        reportCount: { $sum: 1 },
        reasons: { $addToSet: "$reason" },
        firstReportedAt: { $min: "$createdAt" },
        lastReportedAt: { $max: "$createdAt" },
        latestSnapshot: { $last: "$snapshot" },
      },
    },
    { $sort: { reportCount: -1, lastReportedAt: -1 } },
    { $skip: skip },
    { $limit: limit },
  ]);

  const totalGroups = await Report.aggregate([
    { $match: match },
    { $group: { _id: { contentType: "$contentType", contentId: "$contentId" } } },
    { $count: "total" },
  ]);

  return {
    items: grouped.map((g) => ({
      contentType: g._id.contentType,
      contentId: g._id.contentId,
      reportCount: g.reportCount,
      reasons: g.reasons,
      firstReportedAt: g.firstReportedAt,
      lastReportedAt: g.lastReportedAt,
      snapshot: g.latestSnapshot,
    })),
    total: totalGroups[0]?.total || 0,
  };
};

const getReportsForContent = async (contentType, contentId) => {
  return Report.find({ contentType, contentId })
    .populate("reporter", "firstName lastName")
    .populate("moderator", "firstName lastName")
    .sort({ createdAt: -1 });
};

// ─── Resolve ────────────────────────────────────────────────────────────────
// decision: 'dismiss' | 'remove_content' | 'warn_user' | 'suspend_user' | 'ban_user'
const resolveReport = async ({ contentType, contentId, decision, moderatorId, moderatorNote }) => {
  const adapter = getAdapter(contentType);
  const Model = adapter.model();
  const User = require("../models/User"); // adjust path to your actual model

  const content = await Model.findById(contentId);
  const authorId = content ? content[adapter.getAuthorField()] : null;

  const actionMap = {
    dismiss: "none",
    remove_content: "content_removed",
    warn_user: "user_warned",
    suspend_user: "user_suspended",
    ban_user: "user_banned",
  };
  const actionTaken = actionMap[decision];
  if (!actionTaken) {
    const err = new Error(`Unknown decision: ${decision}`);
    err.statusCode = 400;
    throw err;
  }

  if (decision === "remove_content" && content) {
    await adapter.remove(content);
  }

  if (authorId && ["warn_user", "suspend_user", "ban_user"].includes(decision)) {
    const user = await User.findById(authorId);
    if (user) {
      if (decision === "warn_user") {
        user.strikeCount = (user.strikeCount || 0) + 1;
      } else if (decision === "suspend_user") {
        user.isSuspended = true;
        user.suspendedUntil = new Date(Date.now() + SUSPENSION_DAYS * 24 * 60 * 60 * 1000);
        user.strikeCount = (user.strikeCount || 0) + 1;
      } else if (decision === "ban_user") {
        user.isBanned = true;
        user.banReason = moderatorNote || "Violated community guidelines";
      }
      await user.save();
    }
  }

  // Resolve every pending/reviewing report against this content at once —
  // moderators shouldn't have to click through 6 duplicate reports for the
  // same post one at a time.
  const result = await Report.updateMany(
    { contentType, contentId, status: { $in: ["pending", "reviewing"] } },
    {
      status: decision === "dismiss" ? "dismissed" : "resolved",
      moderator: moderatorId,
      moderatorNote: moderatorNote || null,
      actionTaken,
      resolvedAt: new Date(),
    }
  );

  return { modifiedCount: result.modifiedCount, actionTaken };
};

const getModerationStats = async () => {
  const [pendingGroups, resolvedToday] = await Promise.all([
    Report.aggregate([
      { $match: { status: { $in: ["pending", "reviewing"] } } },
      { $group: { _id: { contentType: "$contentType", contentId: "$contentId" } } },
      { $count: "total" },
    ]),
    Report.countDocuments({
      status: { $in: ["resolved", "dismissed"] },
      resolvedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    }),
  ]);

  return {
    pendingItems: pendingGroups[0]?.total || 0,
    resolvedToday,
  };
};

module.exports = {
  submitReport,
  getModerationQueue,
  getReportsForContent,
  resolveReport,
  getModerationStats,
  AUTO_FLAG_THRESHOLD,
};
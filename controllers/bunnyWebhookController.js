// controllers/bunnyWebhookController.js
const crypto = require("crypto");
const FeedPost = require("../model/FeedPost"); // adjust path to your actual model
const { getVideoDetails, buildPlaybackUrls, isVideoReady, isVideoFailed } = require("../services/bunnyStream");
const { recomputePostMediaStatus } = require("../services/feedMediaStatus");

// Bunny's Stream webhooks don't document a signed-body HMAC scheme the way
// their TUS uploads do, so the simple, verified-safe pattern is a shared
// secret in the webhook URL itself (configure this in Bunny dashboard:
// Stream > your library > API > Webhook URL, as
// https://yourapi.com/webhooks/bunny?secret=<BUNNY_WEBHOOK_SECRET>).
const WEBHOOK_SECRET = process.env.BUNNY_WEBHOOK_SECRET;

const timingSafeEqual = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * This single handler is what your ffmpeg worker, ProcessingJob queue,
 * stuck-job sweeper, and retry/backoff logic all used to be responsible
 * for. Bunny's own infrastructure now does the encoding and retries on
 * their end — this just needs to record the outcome.
 */
const handleBunnyWebhook = async (req, res) => {
  // Always ack fast — Bunny will retry on non-2xx, and we don't want retry
  // storms for videos we don't recognize (e.g. test webhooks, orphaned
  // uploads that never became a post).
  try {
    if (WEBHOOK_SECRET) {
      const provided = req.query.secret;
      if (!provided || !timingSafeEqual(provided, WEBHOOK_SECRET)) {
        console.warn("⚠️ Bunny webhook rejected: bad or missing secret");
        return res.status(401).json({ success: false });
      }
    }

    const { VideoGuid, Status } = req.body || {};
    if (!VideoGuid) {
      return res.status(200).json({ success: true }); // nothing to do, ack anyway
    }

    const post = await FeedPost.findOne({ "media.bunnyVideoId": VideoGuid });
    if (!post) {
      // Not necessarily an error — could be a video created but the
      // client never finished creating the post. Ack and move on.
      console.log(`ℹ️ Bunny webhook for unknown video ${VideoGuid} — no matching post`);
      return res.status(200).json({ success: true });
    }

    const mediaIndex = post.media.findIndex((m) => m.bunnyVideoId === VideoGuid);
    if (mediaIndex === -1) {
      return res.status(200).json({ success: true });
    }

    if (isVideoFailed(Status)) {
      post.media[mediaIndex].status = "failed";
      await post.save();
      await recomputePostMediaStatus(post._id);
      console.error(`❌ Bunny video ${VideoGuid} failed (post ${post._id})`);
      return res.status(200).json({ success: true });
    }

    // For any non-"just queued" status, confirm via the Get Video API
    // rather than trusting the webhook's Status number alone.
    if (Number(Status) === 0) {
      return res.status(200).json({ success: true }); // still queued, nothing to update yet
    }

    const details = await getVideoDetails(VideoGuid);

    if (isVideoReady(details)) {
      const { hlsUrl, thumbnailUrl } = buildPlaybackUrls(VideoGuid);
      post.media[mediaIndex].url = hlsUrl;
      post.media[mediaIndex].thumbnailUrl = thumbnailUrl;
      post.media[mediaIndex].status = "ready";
      await post.save();
      await recomputePostMediaStatus(post._id);
      console.log(`✅ Bunny video ${VideoGuid} ready (post ${post._id})`);
    }
    // else: still encoding, nothing to update yet — another webhook call
    // will follow as encoding progresses.

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("handleBunnyWebhook error:", err);
    // Still ack 200 — this was likely a transient issue on our side (DB
    // hiccup etc), and Bunny will send the next status update regardless.
    // If it doesn't, the sweeper pattern from your old worker (a cron that
    // checks any post stuck in 'processing' for too long and re-queries
    // getVideoDetails directly) is worth keeping as a safety net — see note below.
    return res.status(200).json({ success: true });
  }
};

module.exports = { handleBunnyWebhook };
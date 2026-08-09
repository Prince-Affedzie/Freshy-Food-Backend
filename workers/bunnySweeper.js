// workers/bunnySweeper.js
const FeedPost = require("../model/FeedPost"); // adjust path to your actual model
const { getVideoDetails, buildPlaybackUrls, isVideoReady, isVideoFailed } = require("../services/bunnyStream");
const { recomputePostMediaStatus } = require("../services/feedMediaStatus");

const STUCK_TIMEOUT_MS = 15 * 60 * 1000; // 15 min — generous, most videos finish encoding well before this
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Webhooks can be missed (your server briefly down during deploy, a
 * network blip on Bunny's side, etc). This isn't a job queue anymore —
 * there's no local retry state to recover — it just re-asks Bunny
 * directly for videos that have been sitting in 'processing' too long,
 * which is the one thing a webhook-only design can't self-heal from.
 */
const sweepStuckVideos = async () => {
  try {
    const cutoff = new Date(Date.now() - STUCK_TIMEOUT_MS);

    const stuckPosts = await FeedPost.find({
      mediaStatus: "processing",
      updatedAt: { $lt: cutoff },
      "media.bunnyVideoId": { $exists: true },
    });

    for (const post of stuckPosts) {
      let changed = false;

      for (let i = 0; i < post.media.length; i++) {
        const item = post.media[i];
        if (item.status !== "processing" || !item.bunnyVideoId) continue;

        try {
          const details = await getVideoDetails(item.bunnyVideoId);

          if (isVideoFailed(details?.status)) {
            item.status = "failed";
            changed = true;
          } else if (isVideoReady(details)) {
            const { hlsUrl, thumbnailUrl } = buildPlaybackUrls(item.bunnyVideoId);
            item.url = hlsUrl;
            item.thumbnailUrl = thumbnailUrl;
            item.status = "ready";
            changed = true;
          }
          // else still genuinely encoding — leave as-is, it's not "stuck",
          // it's just a long video. STUCK_TIMEOUT_MS may need tuning if
          // you expect longer clips.
        } catch (err) {
          console.warn(`⚠️ Sweep check failed for video ${item.bunnyVideoId}:`, err.message);
        }
      }

      if (changed) {
        await post.save();
        await recomputePostMediaStatus(post._id);
        console.log(`♻️ Sweeper recovered post ${post._id} from a missed webhook`);
      }
    }
  } catch (err) {
    console.error("sweepStuckVideos error:", err);
  }
};

let timer = null;

const startBunnySweeper = () => {
  if (timer) return;
  console.log("🐰 Bunny sweeper started (safety net for missed webhooks)");
  timer = setInterval(sweepStuckVideos, SWEEP_INTERVAL_MS);
  sweepStuckVideos();
};

const stopBunnySweeper = () => {
  clearInterval(timer);
  timer = null;
};

module.exports = { startBunnySweeper, stopBunnySweeper, sweepStuckVideos };
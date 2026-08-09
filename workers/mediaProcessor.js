// workers/mediaProcessor.js
require("dotenv").config();
const mongoose = require("mongoose");
const ProcessingJob = require("../model/ProcessingJob");
const FeedPost = require("../model/FeedPost");
const { processVideo, generateVideoThumbnail, deleteSingleFile } = require("../config/supabaseS3");

const BUCKET = "FreshyFoodFactory";
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  // Same rule as uploadController.js: fail loud rather than silently run
  // with a working secret hardcoded into source. Rotate this key in the
  // Supabase dashboard if it was ever committed anywhere.
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables. " +
      "Refusing to start with a hardcoded fallback key."
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const POLL_INTERVAL = 5000;
const MAX_CONCURRENT = 2;

let running = true;
let activeJobs = 0;

// ─── Download file from Supabase to buffer ─────────────────────────────────
async function downloadFromSupabase(filePath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(filePath);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Recomputes the post-level mediaStatus aggregate from its individual
 * media items. Your feed listing query should filter on this
 * (e.g. { mediaStatus: { $ne: 'failed' } }) so posts stuck processing or
 * permanently failed don't leak into other users' feeds.
 */
async function recomputePostMediaStatus(postId) {
  const post = await FeedPost.findById(postId).select("media mediaStatus");
  if (!post) return;

  const items = post.media || [];
  let mediaStatus = "ready";
  if (items.some((m) => m.status === "failed")) mediaStatus = "failed";
  else if (items.some((m) => m.status === "processing")) mediaStatus = "processing";

  if (post.mediaStatus !== mediaStatus) {
    post.mediaStatus = mediaStatus;
    await post.save();
  }
}

/**
 * Updates the exact media item by its stored index — deterministic,
 * unlike matching on 'media.url' which breaks if the URL doesn't match
 * for any reason and has no meaningful fallback path.
 */
async function updatePostMediaItem(postId, mediaIndex, patch) {
  await FeedPost.updateOne(
    { _id: postId },
    {
      $set: {
        [`media.${mediaIndex}.url`]: patch.url ?? null,
        [`media.${mediaIndex}.thumbnailUrl`]: patch.thumbnailUrl ?? null,
        [`media.${mediaIndex}.status`]: patch.status,
      },
    }
  );
  await recomputePostMediaStatus(postId);
}

// ─── Process a single job using your existing optimization functions ───────
async function processJob(job) {
  try {
    job.status = "processing";
    job.startedAt = new Date();
    job.attempts += 1;
    await job.save();

    console.log(`📥 [${job._id}] Downloading ${job.filePath}...`);
    const originalBuffer = await downloadFromSupabase(job.filePath);

    let optimizedUrl = job.originalUrl;
    let thumbnailUrl = null;
    let optimizedPath = null;

    if (job.type === "video_optimize") {
      console.log(`🎬 [${job._id}] Optimizing video (720p, 1200k, faststart)...`);

      const optimizedBuffer = await processVideo(originalBuffer);

      let thumbnailBuffer = null;
      try {
        console.log(`📸 [${job._id}] Generating thumbnail...`);
        thumbnailBuffer = await generateVideoThumbnail(originalBuffer);
      } catch (thumbErr) {
        console.warn(`⚠️ [${job._id}] Thumbnail failed:`, thumbErr.message);
      }

      const baseName = `feed/optimized/${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
      optimizedPath = `${baseName}.mp4`;

      const { error: videoError } = await supabase.storage.from(BUCKET).upload(optimizedPath, optimizedBuffer, {
        contentType: "video/mp4",
        cacheControl: "31536000",
        upsert: false,
      });
      if (videoError) throw videoError;

      const { data: videoData } = supabase.storage.from(BUCKET).getPublicUrl(optimizedPath);
      optimizedUrl = videoData.publicUrl;

      if (thumbnailBuffer) {
        const thumbnailPath = `${baseName}_thumb.jpg`;
        const { error: thumbError } = await supabase.storage.from(BUCKET).upload(thumbnailPath, thumbnailBuffer, {
          contentType: "image/jpeg",
          cacheControl: "31536000",
          upsert: false,
        });
        if (!thumbError) {
          const { data: thumbData } = supabase.storage.from(BUCKET).getPublicUrl(thumbnailPath);
          thumbnailUrl = thumbData.publicUrl;
        }
      }

      // Delete the raw uploaded file now that we have the optimized version
      try {
        await deleteSingleFile(job.originalUrl);
        console.log(`🗑️ [${job._id}] Deleted original file`);
      } catch (delErr) {
        console.warn(`⚠️ [${job._id}] Could not delete original:`, delErr.message);
      }
    }

    job.status = "completed";
    job.optimizedUrl = optimizedUrl;
    job.thumbnailUrl = thumbnailUrl;
    job.completedAt = new Date();
    await job.save();

    if (job.postId) {
      // Deterministic update by index — no URL matching, no dead
      // "fallback that repeats the same failing query" code path.
      await updatePostMediaItem(job.postId, job.mediaIndex, {
        url: optimizedUrl,
        thumbnailUrl,
        status: "ready",
      });
      console.log(`✅ [${job._id}] FeedPost ${job.postId} media[${job.mediaIndex}] updated`);
    }

    console.log(`✅ [${job._id}] Completed in ${((Date.now() - job.startedAt) / 1000).toFixed(1)}s`);
  } catch (err) {
    console.error(`❌ [${job._id}] Failed (attempt ${job.attempts}/${job.maxAttempts}):`, err.message);

    if (job.attempts >= job.maxAttempts) {
      job.status = "failed";
      job.errorMessage = err.message;
      job.completedAt = new Date();

      if (job.postId) {
        await updatePostMediaItem(job.postId, job.mediaIndex, { status: "failed" });
      }
    } else {
      job.status = "pending";
      job.errorMessage = err.message;
      job.startedAt = null;
      // NOTE: this retries on the very next poll (≤5s later) with no
      // growing backoff — fine for occasional transient errors, but if a
      // file is *permanently* bad (corrupt upload, unsupported codec),
      // you'll burn through maxAttempts in under 15s. Consider adding a
      // `retryAfter: Date` field and querying
      // `{ status: 'pending', $or: [{ retryAfter: null }, { retryAfter: { $lte: new Date() } }] }`
      // if you want real exponential backoff.
    }

    await job.save();
  }
}

// ─── Stuck job sweeper ────────────────────────────────────────────────────
async function sweepStuckJobs() {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  const stuckJobs = await ProcessingJob.find({
    status: "processing",
    startedAt: { $lt: tenMinutesAgo },
  });

  for (const job of stuckJobs) {
    console.log(`🔧 Resetting stuck job ${job._id}`);
    job.status = "pending";
    job.startedAt = null;
    await job.save();
  }
}

// ─── Main worker loop ─────────────────────────────────────────────────────
async function workerLoop() {
  console.log("🔄 Media processor worker started");
  console.log(`   Polling every ${POLL_INTERVAL / 1000}s, max ${MAX_CONCURRENT} concurrent`);

  while (running) {
    try {
      await sweepStuckJobs();

      const availableSlots = MAX_CONCURRENT - activeJobs;

      if (availableSlots > 0) {
        const candidates = await ProcessingJob.find({ status: "pending" })
          .sort({ createdAt: 1 })
          .limit(availableSlots);

        for (const candidate of candidates) {
          // Atomic claim: only actually take the job if it's still
          // 'pending' at the moment we grab it. Matters the instant you
          // run more than one worker process — without this, two workers
          // can both pick up the same job between the find() above and
          // job.save() inside processJob().
          const job = await ProcessingJob.findOneAndUpdate(
            { _id: candidate._id, status: "pending" },
            { status: "processing", startedAt: new Date() },
            { new: true }
          );
          if (!job) continue; // someone else claimed it first

          activeJobs++;
          processJob(job).finally(() => {
            activeJobs--;
          });
        }
      }
    } catch (err) {
      console.error("Worker loop error:", err);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────
process.on("SIGTERM", async () => {
  console.log("Worker shutting down gracefully...");
  running = false;

  const timeout = setTimeout(() => {
    console.log("Force shutdown after timeout");
    process.exit(0);
  }, 30000);

  const checkInterval = setInterval(() => {
    if (activeJobs === 0) {
      clearTimeout(timeout);
      clearInterval(checkInterval);
      console.log("All jobs completed, shutting down");
      process.exit(0);
    }
  }, 1000);
});

const startWorker = async () => {
  try {
    await mongoose.connect(process.env.DB_URL);
    console.log("📦 MongoDB connected");
    workerLoop();
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  }
};

startWorker();

module.exports = { workerLoop };
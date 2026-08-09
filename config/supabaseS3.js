
const { createClient } = require("@supabase/supabase-js");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

if (process.env.NODE_ENV !== "production") 
  {const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");ffmpeg.setFfmpegPath(ffmpegInstaller.path);}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Bucket name ───────────────────────────────────────────────────────────
const BUCKET = "FreshyFoodFactory";

// ─── Size limits ───────────────────────────────────────────────────────────
const SIZE_LIMITS = {
  product_image: 5 * 1024 * 1024,
  feed_image: 3 * 1024 * 1024,
  feed_video: 25 * 1024 * 1024,
};

// ─── Image dimensions ──────────────────────────────────────────────────────
const DIMENSIONS = {
  product: { width: 1200, quality: 75 },
  feed: { width: 1080, quality: 70 },
};

// ─── Allowed MIME types ────────────────────────────────────────────────────
const ALLOWED_TYPES = {
  image: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
  ],
  video: [
    "video/mp4",
    "video/webm",
    "video/quicktime",
  ],
};

// ===========================================================================
// VALIDATION
// ===========================================================================

const validateFile = (file, type) => {
  if (!file || !file.buffer) {
    throw new Error("Invalid file: no buffer provided");
  }

  const limit = SIZE_LIMITS[type] || SIZE_LIMITS.feed_image;

  if (file.size > limit) {
    const mb = (limit / (1024 * 1024)).toFixed(1);
    throw new Error(`File too large. Maximum size is ${mb}MB`);
  }

  if (file.mimetype) {
    const allowed =
      type === "feed_video"
        ? ALLOWED_TYPES.video
        : ALLOWED_TYPES.image;

    if (!allowed.includes(file.mimetype)) {
      throw new Error(
        `Invalid file type: ${file.mimetype}. Allowed: ${allowed.join(", ")}`
      );
    }
  }
};

const ffprobeHasAudio = (filePath) => {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.warn("⚠️ ffprobe failed, assuming audio present:", err.message);
        return resolve(true);
      }
      const hasAudio = metadata.streams?.some((s) => s.codec_type === "audio");
      resolve(!!hasAudio);
    });
  });
};
 
const processVideo = async (inputBuffer) => {
  const id = crypto.randomBytes(8).toString("hex");
  const inputPath = path.join(os.tmpdir(), `${id}-input`);
  const outputPath = path.join(os.tmpdir(), `${id}-output.mp4`);
 
  const cleanup = () => {
    try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch (_) {}
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (_) {}
  };
 
  try {
    fs.writeFileSync(inputPath, inputBuffer);
 
    // Quick sanity check — if the buffer didn't actually make it to disk
    // intact (e.g. a truncated download from storage), fail fast with a
    // clear message instead of letting ffmpeg produce a confusing one.
    const writtenSize = fs.statSync(inputPath).size;
    if (writtenSize !== inputBuffer.length) {
      cleanup();
      throw new Error(`Input file write mismatch: expected ${inputBuffer.length} bytes, wrote ${writtenSize}`);
    }
 
    const hasAudio = await ffprobeHasAudio(inputPath);
 
    return await new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath)
        .videoFilters(["scale=w=720:h=-2:force_original_aspect_ratio=decrease"])
        .videoCodec("libx264")
        .videoBitrate("1200k")
        .outputOptions(["-preset veryfast", "-movflags +faststart", "-pix_fmt yuv420p"])
        .format("mp4");
 
      if (hasAudio) {
        command.audioCodec("aac").audioBitrate("96k");
      } else {
        // This is the fix for the most common cause of this exact error —
        // demanding an AAC audio track when the source has none.
        console.log(`[${id}] No audio stream detected — encoding video-only`);
        command.noAudio();
      }
 
      let stderrLog = "";
 
      command
        .on("start", (cmd) => console.log(`🎬 [${id}] ffmpeg command: ${cmd}`))
        .on("stderr", (line) => {
          stderrLog += line + "\n";
        })
        .on("end", () => {
          try {
            const outputBuffer = fs.readFileSync(outputPath);
            cleanup();
            resolve(outputBuffer);
          } catch (error) {
            cleanup();
            reject(error);
          }
        })
        .on("error", (error, stdout, stderr) => {
          cleanup();
          // fluent-ffmpeg's 3rd callback arg is often more complete than
          // the accumulated 'stderr' event log — prefer it, fall back to
          // what we captured via the stream if it's empty.
          const detail = (stderr || stderrLog || "(no stderr captured)").trim();
          console.error(`🔴 [${id}] ffmpeg failed. Full stderr:\n${detail}`);
          // Surface the tail of stderr in the thrown error so it shows up
          // in your job's lastError / errorMessage field without needing
          // to go dig through server logs every time.
          const tail = detail.split("\n").slice(-8).join(" | ");
          reject(new Error(`${error.message} — ${tail}`));
        })
        .save(outputPath);
    });
  } catch (error) {
    cleanup();
    throw error;
  }
};
 
// ===========================================================================
// VIDEO THUMBNAIL (patched: same stderr capture)
// ===========================================================================
 
const generateVideoThumbnail = (inputBuffer) => {
  return new Promise((resolve, reject) => {
    const id = crypto.randomBytes(8).toString("hex");
 
    const inputPath = path.join(os.tmpdir(), `${id}-thumb-input`);
    const thumbnailPath = path.join(os.tmpdir(), `${id}-thumbnail.jpg`);
 
    let stderrLog = "";
 
    try {
      fs.writeFileSync(inputPath, inputBuffer);
 
      ffmpeg(inputPath)
        .screenshots({
          timestamps: ["1"],
          filename: path.basename(thumbnailPath),
          folder: path.dirname(thumbnailPath),
          size: "720x?",
        })
        .on("stderr", (line) => {
          stderrLog += line + "\n";
        })
        .on("end", () => {
          try {
            const thumbnailBuffer = fs.readFileSync(thumbnailPath);
            fs.unlinkSync(inputPath);
            fs.unlinkSync(thumbnailPath);
            resolve(thumbnailBuffer);
          } catch (error) {
            reject(error);
          }
        })
        .on("error", (error, stdout, stderr) => {
          try {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath);
          } catch (_) {}
 
          const detail = (stderr || stderrLog || "(no stderr captured)").trim();
          console.error(`🔴 [${id}] thumbnail generation failed. stderr:\n${detail}`);
          reject(new Error(`${error.message} — ${detail.split("\n").slice(-6).join(" | ")}`));
        });
    } catch (error) {
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath);
      } catch (_) {}
      reject(error);
    }
  });
};
// ===========================================================================
// CORE UPLOAD FUNCTION
// ===========================================================================

const uploadToSupabase = async (file, prefix, options = {}) => {
  const {
    width = 1080,
    quality = 70,
    contentType = "image/webp",
    isVideo = false,
  } = options;

  let buffer = file.buffer;
  let finalContentType = contentType;
  let fileName;

  // -------------------------------------------------------------------------
  // VIDEO
  // -------------------------------------------------------------------------

  if (isVideo) {
    console.log("Processing video...");

    // Compress/transcode video
    buffer = await processVideo(file.buffer);

    const baseName = `${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 10)}`;

    fileName = `${prefix}/${baseName}.mp4`;
    finalContentType = "video/mp4";

    // Upload optimized video
    const { error: videoError } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, buffer, {
        contentType: finalContentType,

        // Video files are immutable, so cache them for a long time
        cacheControl: "31536000",

        upsert: false,
      });

    if (videoError) throw videoError;

    const { data: videoData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(fileName);

    // -----------------------------------------------------------------------
    // Generate thumbnail
    // -----------------------------------------------------------------------

    let thumbnailUrl = null;
    let thumbnailPath = null;

    try {
      const thumbnailBuffer = await generateVideoThumbnail(file.buffer);

      thumbnailPath = `${prefix}/thumbnails/${baseName}.jpg`;

      const { error: thumbnailError } = await supabase.storage
        .from(BUCKET)
        .upload(thumbnailPath, thumbnailBuffer, {
          contentType: "image/jpeg",
          cacheControl: "31536000",
          upsert: false,
        });

      if (!thumbnailError) {
        const { data: thumbnailData } = supabase.storage
          .from(BUCKET)
          .getPublicUrl(thumbnailPath);

        thumbnailUrl = thumbnailData.publicUrl;
      }
    } catch (thumbnailError) {
      console.error(
        "Thumbnail generation failed:",
        thumbnailError.message
      );
    }

    return {
      url: videoData.publicUrl,
      path: fileName,
      type: "video",
      thumbnailUrl,
      thumbnailPath,
    };
  }

  // -------------------------------------------------------------------------
  // IMAGE
  // -------------------------------------------------------------------------

  buffer = await sharp(file.buffer)
    .resize({
      width,
      withoutEnlargement: true,
    })
    .webp({
      quality,
    })
    .toBuffer();

  fileName = `${prefix}/${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 10)}.webp`;

  finalContentType = "image/webp";

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, buffer, {
      contentType: finalContentType,

      // Images are also immutable
      cacheControl: "31536000",

      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(fileName);

  return {
    url: data.publicUrl,
    path: fileName,
    type: "image",
  };
};

// ===========================================================================
// PRODUCT IMAGES
// ===========================================================================

const uploadProductImage = async (file) => {
  validateFile(file, "product_image");

  return uploadToSupabase(file, "products", {
    width: DIMENSIONS.product.width,
    quality: DIMENSIONS.product.quality,
  });
};

const uploadMultipleProductImages = async (files = []) => {
  if (!files.length) return [];

  const uploadPromises = files.map(file =>
    uploadProductImage(file)
  );

  return Promise.all(uploadPromises);
};

// ===========================================================================
// FEED IMAGE
// ===========================================================================

const uploadFeedImage = async (file) => {
  validateFile(file, "feed_image");

  return uploadToSupabase(file, "feed", {
    width: DIMENSIONS.feed.width,
    quality: DIMENSIONS.feed.quality,
  });
};

// ===========================================================================
// FEED VIDEO
// ===========================================================================

const uploadFeedVideo = async (file) => {
  validateFile(file, "feed_video");

  return uploadToSupabase(file, "feed", {
    isVideo: true,
  });
};

// ===========================================================================
// MULTIPLE FEED MEDIA
// ===========================================================================

const uploadMultipleFeedMedia = async (files = []) => {
  if (!files.length) return [];

  const uploadPromises = files.map(file => {
    const isVideo = file.mimetype?.startsWith("video/");

    return isVideo
      ? uploadFeedVideo(file)
      : uploadFeedImage(file);
  });

  return Promise.all(uploadPromises);
};

// ===========================================================================
// DELETE HELPERS
// ===========================================================================

const extractPathFromUrl = (fullUrl) => {
  try {
    const bucketPart = `${BUCKET}/`;

    if (!fullUrl?.includes(bucketPart)) {
      return null;
    }

    return fullUrl.split(bucketPart)[1];
  } catch (err) {
    console.error("URL parsing error:", err);
    return null;
  }
};

const deleteSingleFile = async (fullUrl) => {
  try {
    if (!fullUrl) return;

    const path = extractPathFromUrl(fullUrl);

    if (!path) return;

    const { error } = await supabase.storage
      .from(BUCKET)
      .remove([path]);

    if (error) {
      console.error(
        "Supabase deletion error:",
        error.message
      );
    }
  } catch (err) {
    console.error("Delete error:", err);
  }
};

const deleteMultipleFiles = async (urls = []) => {
  try {
    if (!urls.length) return;

    const paths = urls
      .map(extractPathFromUrl)
      .filter(Boolean);

    if (!paths.length) return;

    const { error } = await supabase.storage
      .from(BUCKET)
      .remove(paths);

    if (error) {
      console.error(
        "Batch delete error:",
        error.message
      );
    }
  } catch (err) {
    console.error("Batch delete error:", err);
  }
};

// ===========================================================================
// EXPORTS
// ===========================================================================

module.exports = {
  // Product images
  uploadProductImage,
  uploadMultipleProductImages,
  deleteProductImage: deleteSingleFile,
  deleteMultipleProductImages: deleteMultipleFiles,

  // Feed media
  uploadFeedImage,
  uploadFeedVideo,
  uploadMultipleFeedMedia,
  deleteFeedFile: deleteSingleFile,
  deleteMultipleFeedFiles: deleteMultipleFiles,

  // Generic
  uploadToSupabase,
  deleteSingleFile,
  deleteMultipleFiles,
  processVideo,
  generateVideoThumbnail,

  // Constants
  SIZE_LIMITS,
  ALLOWED_TYPES,
};


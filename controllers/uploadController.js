// controllers/uploadController.js
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");
const sharp = require("sharp");
const ProcessingJob = require("../model/ProcessingJob");
const FeedPost = require("../model/FeedPost");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  // Fail loud at boot instead of silently falling back to a working key
  // baked into source. A service role key is a full admin credential to
  // the entire Supabase project (every table, bypassing RLS, every
  // storage file) — a hardcoded fallback means the moment this file is
  // committed anywhere, that credential is compromised.
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables. " +
      "Refusing to start with a hardcoded fallback key."
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const BUCKET = "FreshyFoodFactory";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

const MAX_SIZE = {
  image: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
};

const IMAGE_OUTPUT = { width: 1080, quality: 70 };

// ─── Generate signed upload URL ────────────────────────────────────────────
const getSignedUploadUrl = async (req, res) => {
  try {
    const { fileName, contentType, folder = "feed" } = req.body;

    if (!fileName || !contentType) {
      return res.status(400).json({ success: false, message: "fileName and contentType are required" });
    }

    if (!ALLOWED_TYPES.includes(contentType)) {
      return res
        .status(400)
        .json({ success: false, message: `Invalid content type. Allowed: ${ALLOWED_TYPES.join(", ")}` });
    }

    const isVideo = contentType.startsWith("video/");
    const maxSize = isVideo ? MAX_SIZE.video : MAX_SIZE.image;

    const uniqueId = crypto.randomBytes(12).toString("hex");
    const ext = contentType.split("/")[1] === "quicktime" ? "mov" : contentType.split("/")[1];

    // Raw uploads live under raw/ — a half-uploaded or bogus file never
    // becomes something we treat as real, servable media until confirmUpload
    // has actually verified and (for images) processed it.
    const rawPath = `${folder}/raw/${Date.now()}-${uniqueId}.${ext}`;

    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(rawPath);
    if (error) throw error;

    res.json({
      success: true,
      data: {
        signedUrl: data.signedUrl,
        path: rawPath,
        token: data.token,
        maxSize,
        // NOTE: Supabase's createSignedUploadUrl doesn't accept a per-call
        // size cap or custom expiry — TTL is fixed on Supabase's end.
        // maxSize here is advisory for the client UI; the real enforcement
        // happens server-side in confirmUpload below. Worth re-checking
        // current Supabase Storage docs if this matters a lot to you —
        // their API has changed this kind of detail before.
      },
    });
  } catch (err) {
    console.error("getSignedUploadUrl error:", err);
    res.status(500).json({ success: false, message: "Failed to generate upload URL" });
  }
};

// ─── Confirm upload: verify it landed, optimize images synchronously, ─────
// ─── hand videos off to the background job queue ──────────────────────────
const confirmUpload = async (req, res) => {
  try {
    const { path: rawPath, contentType } = req.body;

    if (!rawPath) {
      return res.status(400).json({ success: false, message: "path is required" });
    }

    const folder = rawPath.split("/").slice(0, -1).join("/");
    const fileNamePart = rawPath.split("/").pop();

    const { data: listing, error: listError } = await supabase.storage
      .from(BUCKET)
      .list(folder, { search: fileNamePart });

    if (listError || !listing?.length) {
      return res.status(404).json({ success: false, message: "File not found in storage" });
    }

    const fileMeta = listing[0];
    const isVideo = /\.(mp4|mov|webm)$/i.test(rawPath) || contentType?.startsWith("video/");
    const maxSize = isVideo ? MAX_SIZE.video : MAX_SIZE.image;

    // Enforce size AFTER the fact — the signed URL itself can't cap it,
    // so this is the actual gate. fileMeta.metadata.size comes back from
    // Supabase's list() response.
    if (fileMeta.metadata?.size && fileMeta.metadata.size > maxSize) {
      await supabase.storage.from(BUCKET).remove([rawPath]);
      const mb = (maxSize / (1024 * 1024)).toFixed(1);
      return res.status(400).json({ success: false, message: `File exceeds ${mb}MB limit` });
    }

    if (isVideo) {
      // Videos are the genuinely slow part (ffmpeg transcode) — this is
      // what actually needs to go through the background job queue.
      const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(rawPath);

      return res.json({
        success: true,
        data: {
          url: publicUrlData.publicUrl,
          path: rawPath,
          type: "video",
          needsProcessing: true,
        },
      });
    }

    // Images: sharp resize+webp is sub-second even for a large camera
    // photo — there's no real reason to route this through the job
    // queue and leave it sitting in a 'processing' state. Do it right
    // here so it's genuinely ready by the time this response returns.
    const { data: rawBlob, error: downloadError } = await supabase.storage.from(BUCKET).download(rawPath);
    if (downloadError) throw downloadError;

    const rawBuffer = Buffer.from(await rawBlob.arrayBuffer());

    const optimizedBuffer = await sharp(rawBuffer)
      .resize({ width: IMAGE_OUTPUT.width, withoutEnlargement: true })
      .webp({ quality: IMAGE_OUTPUT.quality })
      .toBuffer();

    const finalPath = rawPath.replace("/raw/", "/").replace(/\.[a-z0-9]+$/i, ".webp");

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(finalPath, optimizedBuffer, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
    if (uploadError) throw uploadError;

    // Raw original has served its purpose — clean it up, don't block the response on it
    supabase.storage
      .from(BUCKET)
      .remove([rawPath])
      .catch(() => {});

    const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(finalPath);

    res.json({
      success: true,
      data: {
        url: publicUrlData.publicUrl,
        path: finalPath,
        type: "image",
        needsProcessing: false,
      },
    });
  } catch (err) {
    console.error("confirmUpload error:", err);
    res.status(500).json({ success: false, message: "Failed to confirm upload" });
  }
};



module.exports = { getSignedUploadUrl, confirmUpload, };
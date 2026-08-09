// controllers/videoUploadController.js
const { createVideo, generateTusSignature, TUS_UPLOAD_ENDPOINT, BUNNY_LIBRARY_ID } = require("../services/bunnyStream");

const SIGNATURE_TTL_SECONDS = 3 * 60 * 60; // 3 hours — generous for a slow mobile upload

/**
 * Client calls this BEFORE the post exists (same pattern as image uploads):
 * we create a Bunny video object and hand back a scoped, time-limited
 * signature the client can use to upload directly to Bunny via TUS.
 * The raw Bunny AccessKey never leaves the server.
 */
const initVideoUpload = async (req, res) => {
  try {
    const { title } = req.body;

    const video = await createVideo(title);
    const expirationTime = Math.floor(Date.now() / 1000) + SIGNATURE_TTL_SECONDS;
    const signature = generateTusSignature(video.guid, expirationTime);

    res.status(200).json({
      success: true,
      data: {
        videoId: video.guid,
        libraryId: BUNNY_LIBRARY_ID,
        expirationTime,
        signature,
        tusEndpoint: TUS_UPLOAD_ENDPOINT,
      },
    });
  } catch (err) {
    console.error("initVideoUpload error:", err);
    res.status(500).json({ success: false, message: "Failed to initialize video upload" });
  }
};

module.exports = { initVideoUpload };
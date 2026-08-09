// services/bunnyStream.js
const crypto = require("crypto");

const BUNNY_LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID;
const BUNNY_API_KEY = process.env.BUNNY_STREAM_API_KEY; // library-specific Video API key
const BUNNY_CDN_HOSTNAME = process.env.BUNNY_STREAM_CDN_HOSTNAME; // e.g. vz-xxxxxxx.b-cdn.net

if (!BUNNY_LIBRARY_ID || !BUNNY_API_KEY || !BUNNY_CDN_HOSTNAME) {
  throw new Error(
    "Missing BUNNY_STREAM_LIBRARY_ID, BUNNY_STREAM_API_KEY, or BUNNY_STREAM_CDN_HOSTNAME. " +
      "Find these in your Bunny dashboard: Stream > your library > API, and the Pull Zone hostname on the library's overview page."
  );
}

const BASE_URL = `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}`;

const bunnyFetch = async (path, options = {}) => {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      AccessKey: BUNNY_API_KEY,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bunny API ${options.method || "GET"} ${path} failed (${res.status}): ${text}`);
  }

  // DELETE returns no body
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  return res.json();
};

/**
 * Creates an empty video object in the library — this is the "job" record,
 * conceptually equivalent to your old ProcessingJob row, except Bunny owns
 * it and tells you about state changes via webhook instead of you polling.
 */
const createVideo = async (title) => {
  const video = await bunnyFetch("/videos", {
    method: "POST",
    body: JSON.stringify({ title: title || `feed-${Date.now()}` }),
  });
  return video; // { guid, title, ... }
};

/**
 * Generates a time-limited, video-scoped signature for direct client
 * uploads via TUS. Safe to hand to the client — unlike the raw AccessKey,
 * this can only be used to upload to this one videoId before it expires.
 * Formula per Bunny's docs: SHA256(libraryId + apiKey + expirationTime + videoId)
 */
const generateTusSignature = (videoId, expirationTime) => {
  const raw = `${BUNNY_LIBRARY_ID}${BUNNY_API_KEY}${expirationTime}${videoId}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
};

const getVideoDetails = async (videoId) => {
  return bunnyFetch(`/videos/${videoId}`, { method: "GET" });
};

const deleteVideo = async (videoId) => {
  return bunnyFetch(`/videos/${videoId}`, { method: "DELETE" });
};

/**
 * Standard playback URLs Bunny serves once a video has at least one
 * finished resolution. HLS works directly with expo-video's VideoView —
 * no format detection needed on the client side.
 */
// services/bunnyStream.js

const buildPlaybackUrls = (videoId) => ({
  hlsUrl: `https://player.mediadelivery.net/play/${BUNNY_LIBRARY_ID}/${videoId}/playlist.m3u8`,
  thumbnailUrl: `https://${BUNNY_CDN_HOSTNAME}/${videoId}/thumbnail.jpg`,
});

/**
 * Heuristic for "is this video actually ready to play" that doesn't rely
 * on a single hardcoded status-code number, since Bunny's documented
 * status codes were inconsistent across sources at the time this was
 * written. encodeProgress and availableResolutions are more robust
 * signals — verify these field names against a real response from your
 * library (log `details` once) if this doesn't behave as expected.
 */
const isVideoReady = (details) => {
  if (!details) return false;
  if (typeof details.encodeProgress === "number" && details.encodeProgress >= 100) return true;
  if (typeof details.availableResolutions === "string" && details.availableResolutions.length > 0) return true;
  return false;
};

const isVideoFailed = (statusCode) => Number(statusCode) === 5;

module.exports = {
  createVideo,
  generateTusSignature,
  getVideoDetails,
  deleteVideo,
  buildPlaybackUrls,
  isVideoReady,
  isVideoFailed,
  TUS_UPLOAD_ENDPOINT: "https://video.bunnycdn.com/tusupload",
  BUNNY_LIBRARY_ID,
};
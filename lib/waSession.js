/*
 * Conversation state per WhatsApp user, stored in Redis so it survives
 * server restarts and works across multiple app instances.
 *
 * Point the import below at whatever Redis client you already use for
 * the AI search cache — this assumes an ioredis-style client exposing
 * .get / .set / .del.
 */
const redis = require('../config/redis'); // <-- adjust to your existing Redis client

const TTL_SECONDS = 60 * 60 * 6; // 6 hours of inactivity clears the conversation
const keyFor = (phone) => `wa:session:${phone}`;

const DEFAULT_SESSION = () => ({ step: 'idle', data: {} });

async function getSession(phone) {
  const raw = await redis.get(keyFor(phone));
  if (!raw) return DEFAULT_SESSION();
  try {
    return JSON.parse(raw);
  } catch {
    return DEFAULT_SESSION();
  }
}

async function saveSession(phone, session) {
  await redis.set(keyFor(phone), JSON.stringify(session), 'EX', TTL_SECONDS);
}

async function resetSession(phone) {
  await redis.del(keyFor(phone));
}

module.exports = { getSession, saveSession, resetSession };
/*
 * Meta will occasionally redeliver the same webhook event (retries on a
 * slow or failed ack). This guards against processing — and replying
 * to — the same inbound message twice.
 */
const redis = require('../config/redis'); // <-- adjust to your existing Redis client

async function isDuplicate(messageId) {
  if (!messageId) return false;
  // SET ... NX returns null if the key already existed.
  const result = await redis.set(`wa:seen:${messageId}`, '1', 'EX', 60 * 10, 'NX');
  return result === null;
}

module.exports = { isDuplicate };
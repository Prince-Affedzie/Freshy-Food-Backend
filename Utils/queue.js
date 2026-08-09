// utils/queue.js
/*const { Queue, Worker } = require('bullmq');
const { uploadMultipleFeedMedia } = require('../config/supabaseS3');
const FeedPost = require('../model/FeedPost');
const redis = require('../config/redis'); //   existing Redis connection

//  Use the existing Redis connection directly
const mediaQueue = new Queue('media-processing', { connection: redis });

// Create worker
const worker = new Worker('media-processing', async (job) => {
  const { postId, files } = job.data;

  console.log(`Processing media for post ${postId}...`);

  try {
    // Process files
    const mediaUrls = await uploadMultipleFeedMedia(files);

    // Update post with processed media
    await FeedPost.findByIdAndUpdate(postId, {
      media: mediaUrls.map(m => ({
        url: m.url,
        type: m.type,
        thumbnailUrl: m.thumbnailUrl || null,
        status: 'ready',
      })),
    });

    console.log(`✅ Post ${postId} media ready`);
    return { success: true };
  } catch (err) {
    console.error(`❌ Post ${postId} failed:`, err.message);

    // Mark as failed so frontend knows
    await FeedPost.findByIdAndUpdate(postId, {
      media: job.data.files.map(() => ({
        url: null,
        type: 'error',
        status: 'failed',
      })),
    });

    throw err;
  }
}, { 
  connection: redis, //  Same Redis instance
  concurrency: 2,    // Process 2 jobs at a time
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await worker.close();
  await mediaQueue.close();
});

module.exports = { mediaQueue };*/
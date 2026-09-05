// services/storyService.js
const VendorStory = require('../model/VendorStory');
const Vendor = require('../model/Vendor');
const User = require('../model/User');
const { uploadStoryImage,deleteStoryImage } = require('../config/supabaseS3');
const { getVideoDetails, buildPlaybackUrls, isVideoReady, deleteVideo } = require('../services/bunnyStream');

class StoryService {
  // Create a new story
  async createStory({ vendorId, userId, media, caption, sticker, linkedProduct }) {
    try {
      // Validate vendor exists
      const vendor = await Vendor.findById(vendorId);
      if (!vendor) {
        const err = new Error('Vendor not found');
        err.statusCode = 404;
        throw err;
      }

      let mediaData = {};

      if (media.type === 'video' && media.bunnyVideoId) {
        // Video uploaded to Bunny Stream
        const { hlsUrl, thumbnailUrl } = buildPlaybackUrls(media.bunnyVideoId);
        mediaData = {
          url: hlsUrl,
          type: 'video',
          thumbnailUrl,
          duration: media.duration || null,
          uploadSource: 'bunny',
          bunnyVideoId: media.bunnyVideoId,
          status: 'ready', // URL is valid, encoding happens server-side
        };
      } else if (media.type === 'image') {
        // Image uploaded to Supabase
        mediaData = {
          url: media.url,
          type: 'image',
          thumbnailUrl: null,
          duration: null,
          uploadSource: 'supabase',
          bunnyVideoId: null,
          status: 'ready',
        };
      } else {
        const err = new Error('Invalid media type');
        err.statusCode = 400;
        throw err;
      }

      const story = await VendorStory.create({
        vendor: vendorId,
        user: userId,
        media: mediaData,
        caption: caption || '',
        sticker: sticker || null,
        linkedProduct: linkedProduct || null,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      // Notify followers via socket
      
      return story;
    } catch (error) {
      console.error('Create story error:', error);
      throw error;
    }
  }

  // Get active stories from vendors the user follows
  async getActiveStories({ userId }) {
    try {
      const now = new Date();
      
      // Get the user's following list
      const user = await User.findById(userId).select('following').lean();
      const followingIds = user?.following || [];
      
      if (followingIds.length === 0) {
        return [];
      }

      // Find vendors associated with followed users
      const vendors = await Vendor.find({
        user: { $in: followingIds },
      }).select('_id user storeName name profileImage isVerified').lean();

      const vendorIds = vendors.map(v => v._id);
      
      if (vendorIds.length === 0) {
        return [];
      }

      // Find active stories from these vendors
      const stories = await VendorStory.find({
        vendor: { $in: vendorIds },
        status: 'active',
        expiresAt: { $gt: now },
      })
        .populate('vendor', 'storeName name profileImage isVerified')
        .populate('linkedProduct', 'name price images')
        .sort({ createdAt: -1 })
        .lean();

      // Check if user has viewed each story
      const enrichedStories = stories.map(story => ({
        ...story,
        isViewed: story.views?.some(v => v.user.toString() === userId.toString()) || false,
        viewCount: story.views?.length || 0,
        reactionCount: story.reactions?.length || 0,
        views: undefined,
        reactions: undefined,
      }));

      // Group by vendor
      const groupedByVendor = {};
      enrichedStories.forEach(story => {
        const vendorId = story.vendor?._id?.toString();
        if (!vendorId) return;
        
        if (!groupedByVendor[vendorId]) {
          groupedByVendor[vendorId] = {
            vendor: story.vendor,
            stories: [],
            hasUnviewed: false,
          };
        }
        
        groupedByVendor[vendorId].stories.push(story);
        if (!story.isViewed) {
          groupedByVendor[vendorId].hasUnviewed = true;
        }
      });

      return Object.values(groupedByVendor);
    } catch (error) {
      console.error('Get active stories error:', error);
      throw error;
    }
  }

  // Get stories by vendor (only if user follows them)
  async getVendorStories({ vendorId, userId, includeArchived = false }) {
    try {
      // Check if user follows this vendor's user
      const vendor = await Vendor.findById(vendorId).select('user').lean();
      if (!vendor) {
        const err = new Error('Vendor not found');
        err.statusCode = 404;
        throw err;
      }

      const user = await User.findById(userId).select('following').lean();
      const isFollowing = user?.following?.includes(vendor.user) || false;
      
      if (!isFollowing) {
        const err = new Error('You must follow this vendor to view their stories');
        err.statusCode = 403;
        throw err;
      }

      const query = {
        vendor: vendorId,
        status: includeArchived ? { $in: ['active', 'archived'] } : 'active',
        expiresAt: includeArchived ? undefined : { $gt: new Date() },
      };
      
      Object.keys(query).forEach(key => query[key] === undefined && delete query[key]);

      const stories = await VendorStory.find(query)
        .populate('linkedProduct', 'name price images')
        .sort({ createdAt: -1 })
        .lean();

      return stories.map(story => ({
        ...story,
        isViewed: story.views?.some(v => v.user.toString() === userId.toString()) || false,
        viewCount: story.views?.length || 0,
        reactionCount: story.reactions?.length || 0,
        views: undefined,
        reactions: undefined,
      }));
    } catch (error) {
      console.error('Get vendor stories error:', error);
      throw error;
    }
  }

  // Record story view
  async viewStory({ storyId, userId }) {
    try {
      const story = await VendorStory.findById(storyId);
      if (!story || story.status !== 'active') {
        const err = new Error('Story not found or expired');
        err.statusCode = 404;
        throw err;
      }

      const alreadyViewed = story.views.some(v => v.user.toString() === userId.toString());
      if (!alreadyViewed) {
        story.views.push({ user: userId });
        await story.save();
      }

      return { success: true, isNewView: !alreadyViewed };
    } catch (error) {
      console.error('View story error:', error);
      throw error;
    }
  }

  // React to story
  async reactToStory({ storyId, userId, emoji }) {
    try {
      const story = await VendorStory.findById(storyId);
      if (!story || story.status !== 'active') {
        const err = new Error('Story not found or expired');
        err.statusCode = 404;
        throw err;
      }

      story.reactions = story.reactions.filter(r => r.user.toString() !== userId.toString());
      story.reactions.push({ user: userId, emoji });

      await story.save();

      return { success: true, reactionCount: story.reactions.length };
    } catch (error) {
      console.error('React to story error:', error);
      throw error;
    }
  }

  // Delete story
  async deleteStory({ storyId, userId }) {
    try {
      const story = await VendorStory.findById(storyId);
      if (!story) {
        const err = new Error('Story not found');
        err.statusCode = 404;
        throw err;
      }

      if (story.user.toString() !== userId.toString()) {
        const err = new Error('Not authorized to delete this story');
        err.statusCode = 403;
        throw err;
      }

      // Delete media
      if (story.media?.uploadSource === 'bunny' && story.media.bunnyVideoId) {
        try {
          await deleteVideo(story.media.bunnyVideoId);
          console.log(`🗑️ Deleted Bunny video: ${story.media.bunnyVideoId}`);
        } catch (err) {
          console.error(`Failed to delete Bunny video:`, err.message);
        }
      } else if (story.media?.url && story.media.uploadSource === 'supabase') {
        try {
          await deleteStoryImage(story.media.url);
        } catch (err) {
          console.error(`Failed to delete Supabase file:`, err.message);
        }
      }

      story.status = 'deleted';
      await story.save();

      return { success: true };
    } catch (error) {
      console.error('Delete story error:', error);
      throw error;
    }
  }


  // Get my own stories with stats
async getMyStories({ vendorId, userId, page = 1, limit = 20, status = 'all' }) {
  try {
    const query = { vendor: vendorId };
    
    if (status === 'active') {
      query.status = 'active';
      query.expiresAt = { $gt: new Date() };
    } else if (status === 'expired') {
      query.status = 'active';
      query.expiresAt = { $lte: new Date() };
    } else if (status === 'archived') {
      query.status = 'archived';
    }

    const skip = (page - 1) * limit;

    const [stories, total] = await Promise.all([
      VendorStory.find(query)
        .populate('linkedProduct', 'name price images')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      VendorStory.countDocuments(query),
    ]);

    const enrichedStories = stories.map(story => ({
      ...story,
      viewCount: story.views?.length || 0,
      reactionCount: story.reactions?.length || 0,
      reactions: story.reactions || [],
      views: story.views || [],
    }));

    return {
      stories: enrichedStories,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    };
  } catch (error) {
    console.error('Get my stories error:', error);
    throw error;
  }
}

// Get detailed stats for a specific story
async getStoryStats({ storyId, vendorId }) {
  try {
    const story = await VendorStory.findOne({
      _id: storyId,
      vendor: vendorId,
    })
      .populate('views.user', 'firstName lastName profileImage')
      .populate('reactions.user', 'firstName lastName profileImage')
      .populate('linkedProduct', 'name price images')
      .lean();

    if (!story) {
      const err = new Error('Story not found or you are not authorized');
      err.statusCode = 404;
      throw err;
    }

    // Group reactions by emoji
    const reactionSummary = {};
    story.reactions?.forEach(r => {
      if (reactionSummary[r.emoji]) {
        reactionSummary[r.emoji].count++;
      } else {
        reactionSummary[r.emoji] = { emoji: r.emoji, count: 1 };
      }
    });

    // Get unique viewers (in case someone viewed multiple times)
    const uniqueViewers = new Map();
    story.views?.forEach(v => {
      if (v.user?._id) {
        uniqueViewers.set(v.user._id.toString(), v);
      }
    });

    return {
      storyId: story._id,
      caption: story.caption,
      sticker: story.sticker,
      media: story.media,
      createdAt: story.createdAt,
      expiresAt: story.expiresAt,
      status: story.status,
      linkedProduct: story.linkedProduct,
      viewCount: story.views?.length || 0,
      uniqueViewCount: uniqueViewers.size,
      reactionCount: story.reactions?.length || 0,
      reactionSummary: Object.values(reactionSummary),
      viewers: Array.from(uniqueViewers.values()).map(v => ({
        user: v.user,
        viewedAt: v.viewedAt,
      })),
      reactions: story.reactions?.map(r => ({
        user: r.user,
        emoji: r.emoji,
        createdAt: r.createdAt,
      })),
    };
  } catch (error) {
    console.error('Get story stats error:', error);
    throw error;
  }
}
}

module.exports = StoryService;
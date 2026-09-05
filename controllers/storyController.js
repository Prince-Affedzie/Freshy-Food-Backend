// controllers/storyController.js
const StoryService = require('../services/storyService');
const Vendor = require('../model/Vendor');
const { uploadStoryImage } = require('../config/supabaseS3');

const getStoryService = (req) => {
  return req.app.get('storyService');
};

// ─── Create story ──────────────────────────────────────────────────────────
const createStory = async (req, res) => {
  try {
    const storyService = getStoryService(req);
    const { caption, sticker, linkedProduct, mediaType, bunnyVideoId, duration } = req.body;
    
    // Get vendor ID from authenticated user
    const vendor = await Vendor.findOne({ user: req.user.id }).select('_id').lean();
    if (!vendor) {
      return res.status(403).json({ success: false, message: 'You are not a vendor' });
    }

    let mediaData = {};

    if (mediaType === 'video' && bunnyVideoId) {
      // Video already uploaded to Bunny Stream
      mediaData = {
        type: 'video',
        bunnyVideoId,
        duration: duration || null,
      };
    } else if (mediaType === 'image' && req.file) {
      // Image uploaded via multer to Supabase
      const imageUrl = await uploadStoryImage(req.file);
      mediaData = {
        type: 'image',
        url: imageUrl,
      };
    } else {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid media. Provide either an image file or bunnyVideoId for video' 
      });
    }

    const story = await storyService.createStory({
      vendorId: vendor._id,
      userId: req.user.id,
      media: mediaData,
      caption,
      sticker,
      linkedProduct,
    });

    res.status(201).json({ success: true, data: story });
  } catch (error) {
    console.error('Create story error:', error);
    res.status(error.statusCode || 500).json({ 
      success: false, 
      message: error.message || 'Failed to create story' 
    });
  }
};

// ─── Get active stories (only from followed vendors) ──────────────────────
const getActiveStories = async (req, res) => {
  try {
    const storyService = getStoryService(req);
    
    const stories = await storyService.getActiveStories({
      userId: req.user.id,
    });

    res.json({ success: true, data: stories });
  } catch (error) {
    console.error('Get active stories error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stories' });
  }
};

// ─── Get vendor stories (only if following) ───────────────────────────────
const getVendorStories = async (req, res) => {
  try {
    const storyService = getStoryService(req);
    const { vendorId } = req.params;
    const { includeArchived } = req.query;
    
    const stories = await storyService.getVendorStories({
      vendorId,
      userId: req.user.id,
      includeArchived: includeArchived === 'true',
    });

    res.json({ success: true, data: stories });
  } catch (error) {
    console.error('Get vendor stories error:', error);
    res.status(error.statusCode || 500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch stories' 
    });
  }
};

// ─── Get my own stories with stats (for vendor dashboard) ────────────────
const getMyStories = async (req, res) => {
  try {
    const storyService = getStoryService(req);
    const { page = 1, limit = 20, status = 'all' } = req.query;
    
    // Get vendor ID from authenticated user
    const vendor = await Vendor.findOne({ user: req.user.id }).select('_id').lean();
    if (!vendor) {
      return res.status(403).json({ success: false, message: 'You are not a vendor' });
    }

    const stories = await storyService.getMyStories({
      vendorId: vendor._id,
      userId: req.user.id,
      page: parseInt(page),
      limit: parseInt(limit),
      status,
    });

    res.json({ success: true, data: stories });
  } catch (error) {
    console.error('Get my stories error:', error);
    res.status(error.statusCode || 500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch your stories' 
    });
  }
};

// ─── Get story stats (detailed views and reactions) ──────────────────────
const getStoryStats = async (req, res) => {
  try {
    const storyService = getStoryService(req);
    const { storyId } = req.params;
    
    // Get vendor ID from authenticated user
    const vendor = await Vendor.findOne({ user: req.user.id }).select('_id').lean();
    if (!vendor) {
      return res.status(403).json({ success: false, message: 'You are not a vendor' });
    }

    const stats = await storyService.getStoryStats({
      storyId,
      vendorId: vendor._id,
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Get story stats error:', error);
    res.status(error.statusCode || 500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch story stats' 
    });
  }
};

// ─── View story ───────────────────────────────────────────────────────────
const viewStory = async (req, res) => {
  try {
    const storyService = getStoryService(req);
    const { storyId } = req.params;
    
    const result = await storyService.viewStory({
      storyId,
      userId: req.user.id,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('View story error:', error);
    res.status(error.statusCode || 500).json({ 
      success: false, 
      message: error.message || 'Failed to record view' 
    });
  }
};

// ─── React to story ───────────────────────────────────────────────────────
const reactToStory = async (req, res) => {
  try {
    const storyService = getStoryService(req);
    const { storyId } = req.params;
    const { emoji } = req.body;
    
    if (!emoji) {
      return res.status(400).json({ success: false, message: 'Emoji is required' });
    }

    const result = await storyService.reactToStory({
      storyId,
      userId: req.user.id,
      emoji,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('React to story error:', error);
    res.status(error.statusCode || 500).json({ 
      success: false, 
      message: error.message || 'Failed to react to story' 
    });
  }
};

// ─── Delete story ─────────────────────────────────────────────────────────
const deleteStory = async (req, res) => {
  try {
    const storyService = getStoryService(req);
    const { storyId } = req.params;
    
    const result = await storyService.deleteStory({
      storyId,
      userId: req.user.id,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Delete story error:', error);
    res.status(error.statusCode || 500).json({ 
      success: false, 
      message: error.message || 'Failed to delete story' 
    });
  }
};

module.exports = {
  createStory,
  getActiveStories,
  getVendorStories,
  getMyStories,
  getStoryStats,
  viewStory,
  reactToStory,
  deleteStory,
};
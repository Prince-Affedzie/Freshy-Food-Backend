const FeedPost = require('../model/FeedPost')
const ProcessingJob = require('../model/ProcessingJob');
const Vendor = require('../model/Vendor'); // Adjust path as needed
const {uploadFeedImage,
  uploadFeedVideo,
  uploadMultipleFeedMedia,
  deleteFeedFile,
  deleteMultipleFeedFiles} = require('../config/supabaseS3')
  const User = require('../model/User')
const mongoose = require('mongoose')
const { getVideoDetails, buildPlaybackUrls, isVideoReady, deleteVideo, } = require('../services/bunnyStream');


// controllers/feedController.js — Updated createFeedPost

// controllers/feedController.js

const createFeedPost = async (req, res) => {
  try {
    const { type, title, description, tags, campus, linkedProduct, media } = req.body;

    if (!type || !title) {
      return res.status(400).json({
        success: false, message: 'Post type and title are required',
      });
    }

    const mediaItems = Array.isArray(media) ? media : [];

    if (!mediaItems.length && !description && !linkedProduct) {
      return res.status(400).json({
        success: false, message: 'Please add a description, media, or link a product',
      });
    }

    //  Attach URLs immediately — no waiting for encoding
    const processedMedia = mediaItems.map((m) => {
      if (m.bunnyVideoId) {
        const { hlsUrl, thumbnailUrl } = buildPlaybackUrls(m.bunnyVideoId);
        return {
          ...m,
          url: hlsUrl,
          thumbnailUrl,
          type: 'video',
          status: 'ready', // URL is valid, encoding happens server-side
          uploadSource: 'bunny',
        };
      }
      // Image from Supabase
      return {
        ...m,
        status: m.url ? 'ready' : 'processing',
        uploadSource: 'supabase',
      };
    });

    let vendorId = null;
    if (req.user.role === 'vendor') {
      const vendor = await Vendor.findOne({ user: req.user.id || req.user._id }).select('_id').lean();
      vendorId = vendor?._id || null;
    }

    const post = await FeedPost.create({
      author: req.user.id || req.user._id,
      vendorId,
      type,
      title,
      description,
      tags: Array.isArray(tags) ? tags : [],
      campus: campus || 'ALL',
      linkedProduct: linkedProduct || null,
      status: 'approved',
      media: processedMedia,
      mediaStatus: 'ready',
    });

    await post.populate('author', 'firstName lastName profileImage campus role');
    if (post.linkedProduct) {
      await post.populate('linkedProduct', 'name price images campus');
    }

    res.status(201).json({
      success: true,
      data: post,
      message: 'Post created!',
    });
  } catch (err) {
    console.error('createFeedPost error:', err);
    res.status(500).json({ success: false, message: 'Failed to create post' });
  }
};
// ─── Get feed (personalized by campus) ────────────────────────────────────
const getFeed = async (req, res) => {
  try {
    const { type, author, campus, page = 1, limit = 20, sort = 'trending' } = req.query;
    const userCampus = req.user?.campus || 'UG';
    
    const query = { status: 'approved' };
    
    // Filter by type if specified
    if (type) query.type = type;

    if (author) {
      query.author = author;
      }
    
    // Show campus-specific + ALL posts
    if (campus) {
      query.campus = { $in: [campus, 'ALL'] };
    } else {
      query.campus = { $in: [userCampus, 'ALL'] };
    }

    let sortOption = { createdAt: -1 };
    //if (sort === 'trending') sortOption = { views: -1, likes: -1, createdAt: -1 };
    //if (sort === 'popular') sortOption = { likes: -1, createdAt: -1 };

    const posts = await FeedPost.find(query)
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('author', 'role firstName lastName profileImage campus')
      .populate('linkedProduct', 'name price images')
      .lean();

    const total = await FeedPost.countDocuments(query);

    res.json({
      success: true,
      data: {
        posts,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / limit) }
      }
    });
  } catch (err) {
    console.error('getFeed error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch feed' });
  }
};

// ─── Like/Unlike post ─────────────────────────────────────────────────────
const toggleLike = async (req, res) => {
  try {
    const post = await FeedPost.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    const userId = req.user.id;
    const isLiked = post.likes.includes(userId);

    if (isLiked) {
      post.likes.pull(userId);
    } else {
      post.likes.push(userId);
    }

    await post.save();

    res.json({ success: true, data: { isLiked: !isLiked, likeCount: post.likes.length } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to toggle like' });
  }
};

// ─── Add comment ──────────────────────────────────────────────────────────
const addComment = async (req, res) => {
  try {
    const post = await FeedPost.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    post.comments.push({
      user: req.user.id,
      text: req.body.text
    });

    await post.save();
    await post.populate('comments.user', 'firstName lastName profileImage');

    res.json({ success: true, data: post.comments[post.comments.length - 1] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to add comment' });
  }
};

// ─── Increment view ───────────────────────────────────────────────────────
const incrementView = async (req, res) => {
  try {
    await FeedPost.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to track view' });
  }
};

// ─── Get trending posts ───────────────────────────────────────────────────
const getTrendingPosts = async (req, res) => {
  try {
    const posts = await FeedPost.find({ status: 'approved', isTrending: true })
      .sort({ views: -1, likes: -1 })
      .limit(10)
      .populate('author', 'firstName lastName profileImage')
      .lean();

    res.json({ success: true, data: posts });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch trending' });
  }
};

// ─── Delete feed post ─────────────────────────────────────────────────────
const deleteFeedPost = async (req, res) => {
  try {
    const post = await FeedPost.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Check ownership — only the author or an admin can delete
    const isAuthor = post.author.toString() === req.user.id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this post' });
    }

    // Delete associated media
    if (post.media?.length > 0) {
      for (const media of post.media) {
        if (media.uploadSource === 'bunny' && media.bunnyVideoId) {
          // Delete from Bunny Stream
          try {
            await deleteVideo(media.bunnyVideoId);
            console.log(`🗑️ Deleted Bunny video: ${media.bunnyVideoId}`);
          } catch (err) {
            console.error(`Failed to delete Bunny video ${media.bunnyVideoId}:`, err.message);
            // Continue — don't block post deletion if Bunny delete fails
          }
        } else if (media.url) {
          // Delete from Supabase
          try {
            await deleteSingleFile(media.url);
          } catch (err) {
            console.error(`Failed to delete Supabase file:`, err.message);
            // Continue — don't block post deletion if Supabase delete fails
          }
        }
      }

      // Also do batch Supabase cleanup as fallback
      const supabaseUrls = post.media
        .filter(m => m.uploadSource !== 'bunny' && m.url)
        .map(m => m.url);
      
      if (supabaseUrls.length > 0) {
        await deleteMultipleFeedFiles(supabaseUrls);
      }
    }

    // Delete the post
    await FeedPost.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (err) {
    console.error('deleteFeedPost error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete post' });
  }
};
// Also add these helper functions if not already present:

// ─── Save/Unsave post ─────────────────────────────────────────────────────
const toggleSave = async (req, res) => {
  try {
    const post = await FeedPost.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    const userId = req.user.id;
    const user = await User.findById(userId);

    // Check if already saved
    const savedIndex = user.savedPosts.findIndex(
      sp => sp.post.toString() === req.params.id
    );

    if (savedIndex > -1) {
      // Unsave
      user.savedPosts.splice(savedIndex, 1);
      user.savedPostsCount = Math.max(0, user.savedPostsCount - 1);
      post.saves.pull(userId);
    } else {
      // Save
      user.savedPosts.push({ post: req.params.id, savedAt: new Date() });
      user.savedPostsCount += 1;
      post.saves.push(userId);
    }

    await user.save();
    await post.save();

    res.json({
      success: true,
      data: {
        isSaved: savedIndex === -1, // true if just saved
        saveCount: post.saves.length,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to toggle save' });
  }
};

// ─── Get saved posts ──────────────────────────────────────────────────────
const getSavedPosts = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const user = await User.findById(req.user.id)
      .slice('savedPosts', [(page - 1) * limit, page * limit])
      .populate({
        path: 'savedPosts.post',
        select: 'type title description media linkedProduct author likes comments createdAt',
        populate: [
          { path: 'author', select: 'firstName lastName profileImage' },
          { path: 'linkedProduct', select: 'name price images' },
        ],
      })
      .lean();

    const savedPosts = user.savedPosts
      .filter(sp => sp.post) // Filter out deleted posts
      .map(sp => sp.post);

    res.json({
      success: true,
      data: {
        posts: savedPosts,
        total: user.savedPostsCount || 0,
        hasMore: (page * limit) < (user.savedPostsCount || 0),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch saved posts' });
  }
};

// ─── Admin: Approve/Reject post ───────────────────────────────────────────
const moderatePost = async (req, res) => {
  try {
    const { status } = req.body; // 'approved' or 'rejected'
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const post = await FeedPost.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    res.json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to moderate post' });
  }
};

// ─── Get single post detail ───────────────────────────────────────────────
const getPostDetail = async (req, res) => {
  try {
    const post = await FeedPost.findById(req.params.id)
      .populate('author', 'firstName lastName profileImage campus')
      .populate('linkedProduct', 'name price images description campus condition')
      .populate('comments.user', 'firstName lastName profileImage')
      .lean();

    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    // Increment view
    await FeedPost.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });

    res.json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch post' });
  }
};

const getMyFeedPosts = async (req, res) => {
 console.log("I'm working")
  try {
    const { page = 1, limit = 20, type } = req.query;
    const userId = req.user.id;
    console.log(userId)

    const query = { author: userId };

    // Optional: filter by post type
    if (type) {
      query.type = type;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [posts, total] = await Promise.all([
      FeedPost.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('author', 'firstName lastName profileImage campus')
        .populate('linkedProduct', 'name price images')
        .lean(),
      FeedPost.countDocuments(query),
    ]);

    // Get stats
    const stats = await FeedPost.aggregate([
      { $match: { author: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalPosts: { $sum: 1 },
          totalLikes: { $sum: { $size: '$likes' } },
          totalComments: { $sum: { $size: '$comments' } },
          totalViews: { $sum: '$views' },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        posts,
        stats: stats[0] || {
          totalPosts: 0,
          totalLikes: 0,
          totalComments: 0,
          totalViews: 0,
        },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (err) {
    console.log('getMyFeedPosts error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch your posts' });
  }
};


const updateMyFeedPost = async (req, res) => {
  try {
    const post = await FeedPost.findOne({
      _id: req.params.id,
      author: req.user.id,
    });

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const updatableFields = ['title', 'description', 'type', 'campus', 'tags'];
    updatableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        post[field] = req.body[field];
      }
    });

    // Handle linked product
    if (req.body.linkedProduct !== undefined) {
      post.linkedProduct = req.body.linkedProduct || null;
    }

    // Handle media (replace all)
    if (req.files?.length > 0) {
      // Delete old media
      if (post.media?.length > 0) {
        const oldUrls = post.media.map(m => m.url).filter(Boolean);
        await deleteMultipleFeedFiles(oldUrls);
      }
      // Upload new media
      const mediaUrls = await uploadMultipleFeedMedia(req.files);
      post.media = mediaUrls.map(m => ({ url: m.url, type: m.type }));
    }

    await post.save();
    await post.populate('author', 'firstName lastName profileImage campus');
    await post.populate('linkedProduct', 'name price images');

    res.json({ success: true, data: post });
  } catch (err) {
    console.error('updateMyFeedPost error:', err);
    res.status(500).json({ success: false, message: 'Failed to update post' });
  }
};

module.exports = {
  createFeedPost,
  getFeed,
  getTrendingPosts,
  getPostDetail,
  getSavedPosts,
  toggleLike,
  toggleSave,
  addComment,
  incrementView,
  deleteFeedPost,
  moderatePost,
  getMyFeedPosts,
  updateMyFeedPost,
};
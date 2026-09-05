const FeedPost = require('../model/FeedPost')
const ProcessingJob = require('../model/ProcessingJob');
const Vendor = require('../model/Vendor');
const Comment = require('../model/Comment');
const User = require('../model/User');
const {uploadFeedImage,
  uploadFeedVideo,
  uploadMultipleFeedMedia,
  deleteFeedFile,
  deleteMultipleFeedFiles} = require('../config/supabaseS3')
const mongoose = require('mongoose')
const commentService = require('../services/commentService');
const { getVideoDetails, buildPlaybackUrls, isVideoReady, deleteVideo, } = require('../services/bunnyStream');

// ─── Create feed post ───────────────────────────────────────────────────────
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

    // Attach URLs immediately — no waiting for encoding
    const processedMedia = mediaItems.map((m) => {
      if (m.bunnyVideoId) {
        const { hlsUrl, thumbnailUrl } = buildPlaybackUrls(m.bunnyVideoId);
        return {
          ...m,
          url: hlsUrl,
          thumbnailUrl,
          type: 'video',
          status: 'ready',
          uploadSource: 'bunny',
        };
      }
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
    
    if (type) query.type = type;

    if (author) {
      query.author = author;
    }
    
    if (campus) {
      query.campus = { $in: [campus, 'ALL'] };
    } else {
      query.campus = { $in: [userCampus, 'ALL'] };
    }

    let sortOption = { createdAt: -1 };

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

// ─── Search feed posts ────────────────────────────────────────────────────
const searchFeed = async (req, res) => {
  try {
    const { 
      query: searchTerm, 
      type, 
      campus, 
      page = 1, 
      limit = 20,
      sort = 'newest' 
    } = req.query;
    
    const userCampus = req.user?.campus || 'UG';

    // If no search term provided, return empty results
    if (!searchTerm || !searchTerm.trim()) {
      return res.json({
        success: true,
        data: {
          posts: [],
          pagination: { page: 1, limit: parseInt(limit), total: 0, totalPages: 0 }
        }
      });
    }

    const trimmedSearch = searchTerm.trim();
    
    // Build search query using MongoDB text search + regex fallback
    const searchQuery = {
      status: 'approved',
      $or: [
        { title: { $regex: trimmedSearch, $options: 'i' } },
        { description: { $regex: trimmedSearch, $options: 'i' } },
        { tags: { $in: [new RegExp(trimmedSearch, 'i')] } },
        { type: { $regex: trimmedSearch, $options: 'i' } },
      ],
    };

    // Filter by type if specified
    if (type) {
      searchQuery.type = type;
    }

    // Filter by campus
    if (campus) {
      searchQuery.campus = { $in: [campus, 'ALL'] };
    } else {
      searchQuery.campus = { $in: [userCampus, 'ALL'] };
    }

    // Sort options
    let sortOption = { createdAt: -1 };
    if (sort === 'oldest') sortOption = { createdAt: 1 };
    if (sort === 'popular') sortOption = { likes: -1, createdAt: -1 };
    if (sort === 'views') sortOption = { views: -1, createdAt: -1 };

    // Execute search with pagination
    const [posts, total] = await Promise.all([
      FeedPost.find(searchQuery)
        .sort(sortOption)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .populate('author', 'role firstName lastName profileImage campus')
        .populate('linkedProduct', 'name price images')
        .lean(),
      FeedPost.countDocuments(searchQuery),
    ]);

    res.json({
      success: true,
      data: {
        posts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
        searchTerm: trimmedSearch,
      },
    });
  } catch (err) {
    console.error('searchFeed error:', err);
    res.status(500).json({ success: false, message: 'Failed to search feed posts' });
  }
};

// ─── Like/Unlike post ─────────────────────────────────────────────────────
const toggleLike = async (req, res) => {
  try {
    const post = await FeedPost.findById(req.params.id);
    const notificationService = req.app.get("notificationService");
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    const userId = req.user.id;
    const isLiked = post.likes.includes(userId);

    if (isLiked) {
      // Unlike - remove from likes
      post.likes.pull(userId);
    } else {
      // Like - add to likes
      post.likes.push(userId);
    }

    // Save the post FIRST
    await post.save();

    // Send notification AFTER successful save (only for new likes)
    if (!isLiked) {
      // Fetch the liker's user info for a better notification
      const likerUser = await User.findById(userId).select('firstName lastName profileImage');
      
      if (likerUser) {
        await notificationService.notifyPostLiked({
          postAuthorId: post.author,
          likerUser,
          postId: post._id,
          postTitle: post.title,
        });
      }
    }

    res.json({ success: true, data: { isLiked: !isLiked, likeCount: post.likes.length } });
  } catch (err) {
    console.error('toggleLike error:', err);
    res.status(500).json({ success: false, message: 'Failed to toggle like' });
  }
};
// ─── Add comment ──────────────────────────────────────────────────────────
const addComment = async (req, res) => {
  try {
    const { postId, text, parentCommentId } = req.body;
    const notificationService = req.app.get("notificationService");
    
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Comment text is required' });
    }

    const post = await FeedPost.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    const user = await User.findById(req.user.id).select('firstName lastName profileImage');
    
    const comment = await commentService.createComment({
      postId,
      authorId: req.user.id || req.user._id,
      text: text.trim(),
      parentCommentId: parentCommentId || null,
    });


    await notificationService.notifyPostCommented({
      postAuthorId: post.author,
      commenterUser: user,
      postId: post._id,
      postTitle: post.title,
      commentText: text,
    });
    
    res.status(201).json({ success: true, data: comment });
  } catch (err) {
    console.error('Create comment error:', err);
    res.status(err.statusCode || 500).json({ 
      success: false, 
      message: err.message || 'Failed to create comment' 
    });
  }
};

const getComments = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, sort = 'newest' } = req.query;
    
    const result = await commentService.getComments({ postId: id, page, limit, sort });
    
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Get comments error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch comments' });
  }
};

const getReplies = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    const result = await commentService.getReplies({ commentId, page, limit });
    
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Get replies error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch replies' });
  }
};

const toggleCommentLike = async (req, res) => {
  try {
    const { commentId } = req.params;
    const result = await commentService.toggleCommentLike({
      commentId,
      userId: req.user.id || req.user._id,
    });
    
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Toggle comment like error:', err);
    res.status(err.statusCode || 500).json({ 
      success: false, 
      message: err.message || 'Failed to update like' 
    });
  }
};

const updateComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { text } = req.body;
    
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Comment text is required' });
    }
    
    const comment = await commentService.updateComment({
      commentId,
      userId: req.user.id || req.user._id,
      text: text.trim(),
    });
    
    res.json({ success: true, data: comment });
  } catch (err) {
    console.error('Update comment error:', err);
    res.status(err.statusCode || 500).json({ 
      success: false, 
      message: err.message || 'Failed to update comment' 
    });
  }
};

const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    
    await commentService.deleteComment({
      commentId,
      userId: req.user.id || req.user._id,
      isModerator: req.user.role === 'admin' || req.user.role === 'moderator',
    });
    
    res.json({ success: true, message: 'Comment deleted' });
  } catch (err) {
    console.error('Delete comment error:', err);
    res.status(err.statusCode || 500).json({ 
      success: false, 
      message: err.message || 'Failed to delete comment' 
    });
  }
};

const reportComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { reason, description } = req.body;
    
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Reason is required' });
    }
    
    const report = await commentService.reportComment({
      commentId,
      reporterId: req.user.id || req.user._id,
      reason,
      description,
    });
    
    res.status(201).json({ success: true, data: report });
  } catch (err) {
    console.error('Report comment error:', err);
    res.status(err.statusCode || 500).json({ 
      success: false, 
      message: err.message || 'Failed to report comment' 
    });
  }
};

const incrementView = async (req, res) => {
  try {
    await FeedPost.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to track view' });
  }
};

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

const deleteFeedPost = async (req, res) => {
  try {
    const post = await FeedPost.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const isAuthor = post.author.toString() === req.user.id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this post' });
    }

    if (post.media?.length > 0) {
      for (const media of post.media) {
        if (media.uploadSource === 'bunny' && media.bunnyVideoId) {
          try {
            await deleteVideo(media.bunnyVideoId);
            console.log(`🗑️ Deleted Bunny video: ${media.bunnyVideoId}`);
          } catch (err) {
            console.error(`Failed to delete Bunny video ${media.bunnyVideoId}:`, err.message);
          }
        } else if (media.url) {
          try {
            await deleteSingleFile(media.url);
          } catch (err) {
            console.error(`Failed to delete Supabase file:`, err.message);
          }
        }
      }

      const supabaseUrls = post.media
        .filter(m => m.uploadSource !== 'bunny' && m.url)
        .map(m => m.url);
      
      if (supabaseUrls.length > 0) {
        await deleteMultipleFeedFiles(supabaseUrls);
      }
    }

    await FeedPost.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (err) {
    console.error('deleteFeedPost error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete post' });
  }
};

const toggleSave = async (req, res) => {
  try {
    const post = await FeedPost.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    const userId = req.user.id;
    const user = await User.findById(userId);

    const savedIndex = user.savedPosts.findIndex(
      sp => sp.post.toString() === req.params.id
    );

    if (savedIndex > -1) {
      user.savedPosts.splice(savedIndex, 1);
      user.savedPostsCount = Math.max(0, user.savedPostsCount - 1);
      post.saves.pull(userId);
    } else {
      user.savedPosts.push({ post: req.params.id, savedAt: new Date() });
      user.savedPostsCount += 1;
      post.saves.push(userId);
    }

    await user.save();
    await post.save();

    res.json({
      success: true,
      data: {
        isSaved: savedIndex === -1,
        saveCount: post.saves.length,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to toggle save' });
  }
};

const getSavedPosts = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const user = await User.findById(req.user.id)
      .slice('savedPosts', [(page - 1) * limit, page * limit])
      .populate({
        path: 'savedPosts.post',
        select: 'type title description media linkedProduct author likes commentCount createdAt',
        populate: [
          { path: 'author', select: 'role firstName lastName profileImage campus' },
          { path: 'linkedProduct', select: 'name price images' },
        ],
      })
      .lean();

    const savedPosts = user.savedPosts
      .filter(sp => sp.post)
      .map(sp => sp.post);

    const totalSaved = user.savedPostsCount || 0;
    const hasMore = (page * limit) < totalSaved;

    res.json({
      success: true,
      data: {
        posts: savedPosts,
        total: totalSaved,
        hasMore,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalSaved,
          totalPages: Math.ceil(totalSaved / limit),
        },
      },
    });
  } catch (err) {
    console.error('getSavedPosts error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch saved posts' });
  }
};

const moderatePost = async (req, res) => {
  try {
    const { status } = req.body;
    
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

const getPostDetail = async (req, res) => {
  try {
    const post = await FeedPost.findById(req.params.id)
      .populate('author', 'role firstName lastName profileImage campus')
      .populate('linkedProduct', 'name price images description campus condition')
      .lean();

    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    await FeedPost.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
   
    const comments = await Comment.find({
      post: post._id,
      parentComment: null,
      status: 'visible',
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('author', 'firstName lastName profileImage')
      .populate({
        path: 'replies',
        match: { status: 'visible', isDeleted: false },
        options: { sort: { createdAt: 1 }, limit: 3 },
        populate: { path: 'author', select: 'firstName lastName profileImage' },
      })
      .lean();

    const userId = req.user?.id || req.user?._id;
    let isLiked = false;
    let isSaved = false;

    if (userId) {
      isLiked = post.likes?.some(id => id.toString() === userId.toString()) || false;
      
      const user = await User.findById(userId).select('savedPosts').lean();
      isSaved = user?.savedPosts?.some(sp => 
        sp.post?.toString() === post._id.toString()
      ) || false;
    }

    const postResponse = {
      ...post,
      likeCount: post.likes?.length || 0,
      saveCount: post.saves?.length || 0,
      commentCount: post.commentCount || 0,
      isLiked,
      isSaved,
      comments,
      likes: undefined,
      saves: undefined,
    };

    res.json({ 
      success: true, 
      data: postResponse,
      message: 'Post fetched successfully',
    });
  } catch (err) {
    console.error('getPostDetail error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch post' });
  }
};

const getMyFeedPosts = async (req, res) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const userId = req.user.id || req.user._id;

    const query = { author: userId };

    if (type) {
      query.type = type;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [posts, total] = await Promise.all([
      FeedPost.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('author', 'role firstName lastName profileImage campus')
        .populate('linkedProduct', 'name price images')
        .select('type title description media linkedProduct author likes commentCount views status createdAt updatedAt vendorId')
        .lean(),
      FeedPost.countDocuments(query),
    ]);

    const stats = await FeedPost.aggregate([
      { $match: { author: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalPosts: { $sum: 1 },
          totalLikes: { $sum: { $size: { $ifNull: ['$likes', []] } } },
          totalComments: { $sum: { $ifNull: ['$commentCount', 0] } },
          totalViews: { $sum: { $ifNull: ['$views', 0] } },
          totalSaves: { $sum: { $size: { $ifNull: ['$saves', []] } } },
        },
      },
    ]);

    const enrichedPosts = posts.map(post => ({
      ...post,
      likeCount: post.likes?.length || 0,
      saveCount: post.saves?.length || 0,
      isLiked: post.likes?.some(id => id.toString() === userId.toString()) || false,
      likes: undefined,
      saves: undefined,
    }));

    res.status(200).json({
      success: true,
      data: {
        posts: enrichedPosts,
        stats: stats[0] || {
          totalPosts: 0,
          totalLikes: 0,
          totalComments: 0,
          totalViews: 0,
          totalSaves: 0,
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
    console.error('getMyFeedPosts error:', err);
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

    if (req.body.linkedProduct !== undefined) {
      post.linkedProduct = req.body.linkedProduct || null;
    }

    if (req.files?.length > 0) {
      if (post.media?.length > 0) {
        const oldUrls = post.media.map(m => m.url).filter(Boolean);
        await deleteMultipleFeedFiles(oldUrls);
      }
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
  searchFeed,
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
  getComments,
  getReplies,
  toggleCommentLike,
  updateComment,
  deleteComment,
  reportComment,
};
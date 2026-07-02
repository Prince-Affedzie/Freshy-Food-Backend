// controllers/chatController.js
const Conversation = require('../model/Conversation');
const Message = require('../model/Message');
const Product = require('../model/Product');
const Vendor = require('../model/Vendor');
const mongoose = require('mongoose');


// ── Helpers ───────────────────────────────────────────────────────────────────

// Confirm the requesting user is actually a participant in the conversation.
// Returns the conversation if allowed, throws a 403-ready error if not.
const requireParticipant = (conversation, userId) => {
  const buyerId = conversation.buyer._id?.toString() ?? conversation.buyer.toString();
  const sellerId = conversation.seller._id?.toString() ?? conversation.seller.toString();
  const actorId = userId.toString();

  if (actorId !== buyerId && actorId !== sellerId) {
    const err = new Error('You are not a participant in this conversation');
    err.status = 403;
    throw err;
  }
};

// ── Open or retrieve a conversation ──────────────────────────────────────────
//
// POST /api/chat/conversations
// Body: { productId }
//
// A buyer taps "Chat with Seller" on a product page. This either opens the
// existing thread or creates a new one, then returns it — so the client
// always gets a conversation to navigate into without extra logic.

const openConversation = async (req, res) => {
  try {
    const buyerId = req.user.id;
    const { productId } = req.body;
    console.log(req.body)

    if (!productId) {
      return res.status(400).json({ success: false, error: 'productId is required' });
    }

    const product = await Product.findById(productId).select('vendor name images price');
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const vendorId = product.vendor;
    const vendor = await Vendor.findById(vendorId)

    if (buyerId.toString() === vendor.user.toString()) {
      return res.status(400).json({ success: false, error: "You can't chat about your own product" });
    }

    const { conversation, created } = await Conversation.findOrCreate({
      productId: productId,
      buyerId: buyerId,
      sellerId: vendor.user,
    });

    // Populate enough for the client to render the chat header immediately
    const populated = await Conversation.findById(conversation._id)
      .populate('product', 'name images price negotiable')
      .populate('buyer', 'firstName avatar')
      .populate('seller', 'firstName avatar')
      .populate('lastMessage');

    return res.status(created ? 201 : 200).json({ success: true, conversation: populated });
  } catch (err) {
    console.error('openConversation error:', err);
    return res.status(err.status || 500).json({ success: false, error: err.message });
  }
};

// ── Get inbox (all conversations for the logged-in user) ─────────────────────
//
// GET /api/chat/conversations
// Query: ?status=active|archived  (default: active)
//
// Returns conversations sorted by most recently active, with lastMessage
// populated for preview text and unread counts for badges.

const getInbox = async (req, res) => {
  try {
    const userId = req.user.id;
    const status = req.query.status || 'active';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    // User can be either buyer or seller in different conversations
    const query = {
      $or: [{ buyer: userId }, { seller: userId }],
      status,
    };

    const [conversations, total] = await Promise.all([
      Conversation.find(query)
        .populate('product', 'name images price')
        .populate('buyer', 'firstName avatar')
        .populate('seller', 'firstName avatar')
        .populate('lastMessage')
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Conversation.countDocuments(query),
    ]);

    // Attach the correct unread count for *this* user on each conversation
    // so the client doesn't need to figure out buyer vs seller itself
    const enriched = conversations.map((conv) => {
      const isBuyer = conv.buyer._id.toString() === userId.toString();
      return {
        ...conv.toObject(),
        myUnread: isBuyer ? conv.buyerUnread : conv.sellerUnread,
      };
    });

    return res.json({
      success: true,
      conversations: enriched,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('getInbox error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Get a single conversation ─────────────────────────────────────────────────
//
// GET /api/chat/conversations/:id
//
// Used to re-hydrate the chat screen on revisit or deep link.

const getConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id)
      .populate('product', 'name images price negotiable')
      .populate('buyer', 'firstName avatar')
      .populate('seller', 'firstName avatar')
      .populate('lastMessage');

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    requireParticipant(conversation, req.user.id);

    const isBuyer = conversation.buyer._id.toString() === req.user.id.toString();
    return res.json({
      success: true,
      conversation: {
        ...conversation.toObject(),
        myUnread: isBuyer ? conversation.buyerUnread : conversation.sellerUnread,
      },
    });
  } catch (err) {
    console.error('getConversation error:', err);
    return res.status(err.status || 500).json({ success: false, error: err.message });
  }
};

// ── Get messages for a conversation (paginated) ───────────────────────────────
//
// GET /api/chat/conversations/:id/messages
// Query: ?before=<ISO timestamp>&limit=30
//
// Uses cursor-based pagination so loading older messages stays fast
// regardless of how many total messages exist in the thread.
// `before` is the createdAt of the oldest message the client currently has.

const getMessages = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    requireParticipant(conversation, req.user.id);

    const { before, limit } = req.query;

    const messages = await Message.getForConversation(req.params.id, {
      before,
      limit: parseInt(limit) || 30,
    });

    return res.json({ success: true, messages });
  } catch (err) {
    console.error('getMessages error:', err);
    return res.status(err.status || 500).json({ success: false, error: err.message });
  }
};

// ── Send a message via REST (fallback if socket isn't connected) ──────────────
//
// POST /api/chat/conversations/:id/messages
// Body: { text }
//
// The primary send path is Socket.io. This REST endpoint is the fallback
// for poor network conditions where the socket connection dropped but
// the user still has HTTP.

const sendMessage = async (req, res) => {
  try {
    const { text } = req.body;
     const notificationService = req.app.get("notificationService");

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Message text is required' });
    }

    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const recipientId =
        conversation.buyer.toString() === req.user.id.toString()
          ? conversation.seller.toString()
          : conversation.buyer.toString();

    requireParticipant(conversation, req.user.id);

    if (conversation.status === 'archived') {
      return res.status(400).json({ success: false, error: 'This conversation has been archived' });
    }

    const message = await Message.createAndUpdateConversation({
      conversationId: req.params.id,
      senderId: req.user.id,
      text: text.trim(),
      type: 'text',
    });

    const populated = await message.populate('sender', 'firstName avatar');
    console.log('recipientId',recipientId)
    await notificationService.sendNotification({
          userId:recipientId,
          title:`💬 ${'New message'}`,
          message: text
  });


    return res.status(201).json({ success: true, message: populated });
  } catch (err) {
    console.error('sendMessage error:', err);
    return res.status(err.status || 500).json({ success: false, error: err.message });
  }
};

// ── Mark conversation as read ─────────────────────────────────────────────────
//
// PATCH /api/chat/conversations/:id/read
//
// Called when the user opens the chat screen.
// Resets their unread counter and stamps readAt on all received messages.

const markRead = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    requireParticipant(conversation, req.user.id);

    await Promise.all([
      conversation.markReadFor(req.user.id),
      Message.markAllReadFor(req.params.id, req.user.id),
    ]);

    return res.json({ success: true });
  } catch (err) {
    console.error('markRead error:', err);
    return res.status(err.status || 500).json({ success: false, error: err.message });
  }
};

// ── Archive a conversation ────────────────────────────────────────────────────
//
// PATCH /api/chat/conversations/:id/archive
//
// Soft-deletes the thread from the inbox. Typically triggered when a
// seller marks a product as sold, or a user wants to clean up their inbox.

const archiveConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    requireParticipant(conversation, req.user.id);

    conversation.status = 'archived';
    await conversation.save();

    return res.json({ success: true });
  } catch (err) {
    console.error('archiveConversation error:', err);
    return res.status(err.status || 500).json({ success: false, error: err.message });
  }
};

// ── Get total unread count across all conversations ───────────────────────────
//
// GET /api/chat/unread
//
// Used to drive the global chat badge on the bottom tab bar.
// Aggregates both buyer and seller unread counts for this user.

const getTotalUnread = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id); // ← cast here

    const result = await Conversation.aggregate([
      {
        $match: {
          $or: [{ buyer: userId }, { seller: userId }],
          status: 'active',
        },
      },
      {
        $project: {
          myUnread: {
            $cond: [
              { $eq: ['$buyer', userId] },
              '$buyerUnread',
              '$sellerUnread',
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$myUnread' },
        },
      },
    ]);

    const total = result[0]?.total ?? 0;
    return res.json({ success: true, total });
  } catch (err) {
    console.error('getTotalUnread error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

module.exports = {
  openConversation,
  getInbox,
  getConversation,
  getMessages,
  sendMessage,
  markRead,
  archiveConversation,
  getTotalUnread,
};
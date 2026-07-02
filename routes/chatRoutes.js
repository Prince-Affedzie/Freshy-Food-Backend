// routes/chatRoutes.js
const express = require('express');
const chatRoute = express.Router();
const {
  openConversation,
  getInbox,
  getConversation,
  getMessages,
  sendMessage,
  markRead,
  archiveConversation,
  getTotalUnread,
} = require('../controllers/chatController');
const {auth} = require('../middleware/auth');



// All chat routes require authentication
chatRoute.use(auth);

// ── Conversations ─────────────────────────────────────────────────────────────

// Open or retrieve a conversation about a product
// POST /api/chat/conversations  { productId }
chatRoute.post('/chat/conversations', openConversation);

// Get inbox — all conversations for the logged-in user
// GET  /api/chat/conversations?status=active&page=1&limit=20
chatRoute.get('/chat/conversations', getInbox);

// Get a single conversation (for re-hydrating chat screen on revisit)
// GET  /api/chat/conversations/:id
chatRoute.get('/chat/conversations/:id', getConversation);

// Archive a conversation (soft-delete from inbox)
// PATCH /api/chat/conversations/:id/archive
chatRoute.patch('/chat/conversations/:id/archive', archiveConversation);

// ── Messages ──────────────────────────────────────────────────────────────────

// Load messages for a thread (cursor-paginated, newest-first)
// GET  /api/chat/conversations/:id/messages?before=<ISO>&limit=30
chatRoute.get('/chat/conversations/:id/messages', getMessages);

// REST fallback for sending a message (primary path is Socket.io)
// POST /api/chat/conversations/:id/messages  { text }
chatRoute.post('/chat/conversations/:id/messages', sendMessage);

// Mark all messages in a conversation as read for the current user
// PATCH /api/chat/conversations/:id/read
chatRoute.patch('/chat/conversations/:id/read', markRead);

// ── Unread badge ──────────────────────────────────────────────────────────────

// Total unread count across all conversations — drives the tab bar badge
// GET  /api/chat/unread
chatRoute.get('/chat/unread', getTotalUnread);

module.exports = chatRoute;
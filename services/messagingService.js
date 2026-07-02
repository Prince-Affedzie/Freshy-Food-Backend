// sockets/messagingSocket.js
const Conversation = require('../model/Conversation');
const Message = require('../model/Message');
const User = require('../model/User')

// In-memory map of userId → socketId for online presence
// Resets on server restart — that's fine, presence is ephemeral
const onlineUsers = new Map();

function messagingSocket(io, socket,notificationService) {

  // ── Join a conversation room ────────────────────────────────────────────────
  // Called by the client as soon as a chat screen is opened.
  // The conversationId IS the room name — no extra mapping needed.
  socket.on('joinConversation', ({ conversationId }) => {
    socket.join(conversationId);
  });

  // ── Leave a conversation room ───────────────────────────────────────────────
  // Called when the user navigates away from the chat screen.
  socket.on('leaveConversation', ({ conversationId }) => {
    socket.leave(conversationId);
  });

  // ── Send a message ──────────────────────────────────────────────────────────
  socket.on('sendMessage', async ({ conversationId, senderId, text }) => {
    try {
      // createAndUpdateConversation handles:
      //   - message creation
      //   - lastMessage pointer update on Conversation
      //   - recipient's unread counter increment
      const message = await Message.createAndUpdateConversation({
        conversationId,
        senderId,
        text,
        type: 'text',
      });

      // Populate sender info so the client can render the avatar immediately
      const populated = await message.populate('sender', 'firstName avatar');

      // Emit to everyone in the room (including sender — simpler client logic)
      io.to(conversationId).emit('newMessage', populated);

      // Emit an updated conversation snapshot to both participants' personal rooms
      // so their inbox list (lastMessage preview + unread badge) refreshes live
      const conversation = await Conversation.findById(conversationId)
        .populate('lastMessage')
        .populate('product', 'name images');

      io.to(`user:${conversation.buyer.toString()}`).emit('conversationUpdated', conversation);
      io.to(`user:${conversation.seller.toString()}`).emit('conversationUpdated', conversation);

      // Push notification to the recipient (only if they're not already in the room)
      const recipientId =
        conversation.buyer.toString() === senderId.toString()
          ? conversation.seller.toString()
          : conversation.buyer.toString();

      const isRecipientOnline = onlineUsers.has(recipientId);
      
        const sender = await User.findById(senderId).select('firstName');
        await notificationService.sendNotification({
          userId: recipientId,
          title: `💬 ${ 'New message' || sender?.firstName }`,
          message: 'You have a new message on CediMart'
    });
     
    } catch (err) {
      console.error('sendMessage error:', err.message);
      socket.emit('messageError', { error: err.message });
    }
  });

  // ── Send an offer_link message ──────────────────────────────────────────────
  // Called by your offer service (offerService.js) after an offer action,
  // NOT directly by the client. This keeps offer logic in the service layer.
  //
  // Usage from offerService.js:
  //   io.emit('offerAction', { conversationId, senderId, offerMeta, displayText })
  //
  // Or call the helper exported at the bottom of this file.
  /*socket.on('offerAction', async ({ conversationId, senderId, offerMeta, displayText }) => {
    try {
      const message = await Message.createAndUpdateConversation({
        conversationId,
        senderId,
        text: displayText,   // e.g. "Kofi made an offer of GH₵2,500"
        type: 'offer_link',
        offerMeta,
      });

      const populated = await message.populate('sender', 'name avatar');
      io.to(conversationId).emit('newMessage', populated);

      const conversation = await Conversation.findById(conversationId)
        .populate('lastMessage')
        .populate('product', 'title images');

      io.to(`user:${conversation.buyer.toString()}`).emit('conversationUpdated', conversation);
      io.to(`user:${conversation.seller.toString()}`).emit('conversationUpdated', conversation);
    } catch (err) {
      console.error('offerAction error:', err.message);
    }
  });*/

  // ── Mark conversation as read ───────────────────────────────────────────────
  // Called when the user opens a chat screen.
  // Resets their unread counter and stamps readAt on all received messages.
  socket.on('markRead', async ({ conversationId, userId }) => {
    try {
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) return;

      // Reset unread counter on the Conversation document
      await conversation.markReadFor(userId);

      // Stamp readAt on all messages the user received but hasn't read
      await Message.markAllReadFor(conversationId, userId);

      // Tell the other participant their messages were read (for read receipts)
      const otherUserId =
        conversation.buyer.toString() === userId.toString()
          ? conversation.seller.toString()
          : conversation.buyer.toString();

      io.to(`user:${otherUserId}`).emit('messagesRead', { conversationId, readBy: userId });

      // Refresh the reader's inbox so the unread badge clears
      io.to(`user:${userId}`).emit('conversationUpdated', await Conversation.findById(conversationId)
        .populate('lastMessage')
        .populate('product', 'title images')
      );
    } catch (err) {
      console.error('markRead error:', err.message);
    }
  });

  // ── Typing indicators ───────────────────────────────────────────────────────
  socket.on('typing', ({ conversationId, userId }) => {
    socket.to(conversationId).emit('userTyping', { userId, conversationId });
  });

  socket.on('stopTyping', ({ conversationId, userId }) => {
    socket.to(conversationId).emit('userStopTyping', { userId, conversationId });
  });

  // ── Online presence ─────────────────────────────────────────────────────────
  // Each user joins a personal room (user:<id>) on connect
  // so we can emit targeted events (inbox updates, unread badges) to them
  // even when they're not inside a specific conversation room.
  socket.on('userOnline', (userId) => {
    onlineUsers.set(userId, socket.id);
    socket.join(`user:${userId}`);
    io.emit('onlineUsers', Array.from(onlineUsers.keys()));
  });

  // ── Disconnect ──────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }
    io.emit('onlineUsers', Array.from(onlineUsers.keys()));
  });
}

// ── Standalone helper ─────────────────────────────────────────────────────────
// Use this in offerService.js to emit an offer_link message without going
// through the socket event. Pass the io instance from your server setup.
//
// Example in offerService.js:
//   const { emitOfferMessage } = require('../sockets/messagingSocket');
//   await emitOfferMessage(io, { conversationId, senderId, offer, action: 'made an offer' });
//
/*const emitOfferMessage = async (io, { conversationId, senderId, offer, action }) => {
  if (!conversationId) return; // offer might not have a linked conversation yet

  const displayText = `${action} · GH₵${offer.currentPrice}`;

  const message = await Message.createAndUpdateConversation({
    conversationId,
    senderId,
    text: displayText,
    type: 'offer_link',
    offerMeta: {
      offerId: offer._id,
      offerPrice: offer.currentPrice,
      offerStatus: offer.status,
      action,
    },
  });

  const populated = await message.populate('sender', 'name avatar');
  io.to(conversationId).emit('newMessage', populated);

  const conversation = await Conversation.findById(conversationId)
    .populate('lastMessage')
    .populate('product', 'title images');

  io.to(`user:${conversation.buyer.toString()}`).emit('conversationUpdated', conversation);
  io.to(`user:${conversation.seller.toString()}`).emit('conversationUpdated', conversation);
};*/



module.exports = { messagingSocket};
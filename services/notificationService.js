const { NotificationModel } = require('../model/NotificationModel');
const { sendPushNotification } = require('./expo-server-notification-sdk');
const User = require('../model/User');


class NotificationService {
  constructor(socketIO = null) {
    this.socketIO = socketIO;
  }

  resolveRoleMessage({ role, templates, fallback }) {
    if (!role) return fallback;
    return templates[role] || fallback;
  }

  formatAdminTitle(title) {
    return title;
  }

  async sendNotification({ userId, title, message, data = null }) {
    try {
      const user = await User.findById(userId).select('pushToken firstName lastName');
      if (!user) return null;

      const notification = await NotificationModel.create({
        user: userId,
        title,
        message,
        ...(data ? { data } : {}),
      });

      // Socket.IO
      if (this.socketIO) {
        this.socketIO.to(userId.toString()).emit('notification', notification);
      }

      // Push
      if (user.pushToken) {
        await sendPushNotification(user.pushToken, title, message, data);
      }

      return notification;
    } catch (error) {
      console.error('Notification error:', error);
      return null;
    }
  }

  // ─── Social Interaction Notifications ─────────────────────────────────────

  // Notify post author when someone likes their post
  async notifyPostLiked({ postAuthorId, likerUser, postId, postTitle }) {
    if (postAuthorId.toString() === likerUser._id.toString()) return null;

    const likerName = `${likerUser.firstName || ''} ${likerUser.lastName || ''}`.trim() || 'Someone';
    const postPreview = postTitle ? postTitle.slice(0, 50) : 'your post';

    return this.sendNotification({
      userId: postAuthorId,
      title: '❤️ New Like',
      message: `${likerName} liked your post: "${postPreview}"`,
      data: {
        type: 'post_like',
        postId: postId?.toString(),
        likerId: likerUser._id.toString(),
      },
    });
  }

  // Notify post author when someone comments on their post
  async notifyPostCommented({ postAuthorId, commenterUser, postId, postTitle, commentText }) {
    if (postAuthorId.toString() === commenterUser._id.toString()) return null;

    const commenterName = `${commenterUser.firstName || ''} ${commenterUser.lastName || ''}`.trim() || 'Someone';
    const postPreview = postTitle ? postTitle.slice(0, 40) : 'your post';
    const commentPreview = commentText ? commentText.slice(0, 60) : '';

    return this.sendNotification({
      userId: postAuthorId,
      title: '💬 New Comment',
      message: `${commenterName} commented on your post: "${postPreview}"${commentPreview ? `\n\n"${commentPreview}${commentText.length > 60 ? '...' : ''}"` : ''}`,
      data: {
        type: 'post_comment',
        postId: postId?.toString(),
        commenterId: commenterUser._id.toString(),
      },
    });
  }

  // Notify comment author when someone replies to their comment
  async notifyCommentReplied({ commentAuthorId, replierUser, postId, replyText }) {
    if (commentAuthorId.toString() === replierUser._id.toString()) return null;

    const replierName = `${replierUser.firstName || ''} ${replierUser.lastName || ''}`.trim() || 'Someone';
    const replyPreview = replyText ? replyText.slice(0, 60) : '';

    return this.sendNotification({
      userId: commentAuthorId,
      title: '↩️ New Reply',
      message: `${replierName} replied to your comment${replyPreview ? `:\n\n"${replyPreview}${replyText.length > 60 ? '...' : ''}"` : ''}`,
      data: {
        type: 'comment_reply',
        postId: postId?.toString(),
        replierId: replierUser._id.toString(),
      },
    });
  }

  // Notify comment author when someone likes their comment
  async notifyCommentLiked({ commentAuthorId, likerUser, postId, commentText }) {
    if (commentAuthorId.toString() === likerUser._id.toString()) return null;

    const likerName = `${likerUser.firstName || ''} ${likerUser.lastName || ''}`.trim() || 'Someone';
    const commentPreview = commentText ? commentText.slice(0, 50) : '';

    return this.sendNotification({
      userId: commentAuthorId,
      title: '👍 Comment Liked',
      message: `${likerName} liked your comment${commentPreview ? `: "${commentPreview}${commentText.length > 50 ? '...' : ''}"` : ''}`,
      data: {
        type: 'comment_like',
        postId: postId?.toString(),
        likerId: likerUser._id.toString(),
      },
    });
  }

  // Notify user when someone follows them
  async notifyNewFollower({ followedUserId, followerUser }) {
    if (followedUserId.toString() === followerUser._id.toString()) return null;

    const followerName = `${followerUser.firstName || ''} ${followerUser.lastName || ''}`.trim() || 'Someone';

    return this.sendNotification({
      userId: followedUserId,
      title: '👋 New Follower',
      message: `${followerName} started following you`,
      data: {
        type: 'new_follower',
        followerId: followerUser._id.toString(),
      },
    });
  }

  // Notify vendor when someone follows their store
  async notifyVendorFollowed({ vendorUserId, followerUser }) {
    if (vendorUserId.toString() === followerUser._id.toString()) return null;

    const followerName = `${followerUser.firstName || ''} ${followerUser.lastName || ''}`.trim() || 'Someone';

    return this.sendNotification({
      userId: vendorUserId,
      title: '🏪 New Store Follower',
      message: `${followerName} started following your store`,
      data: {
        type: 'vendor_follow',
        followerId: followerUser._id.toString(),
      },
    });
  }

  // Send notification to all admins
  async notifyAdmins({ title, message }) {
    try {
      const admins = await User.find({ role: "admin" }).select('_id pushToken');

      if (!admins.length) {
        console.log('No admins found for notification');
        return;
      }

      const notifications = [];

      for (const admin of admins) {
        const notification = await NotificationModel.create({
          user: admin._id,
          title: this.formatAdminTitle(title),
          message,
        });

        // Socket.IO
        if (this.socketIO) {
          this.socketIO
            .to(admin._id.toString())
            .emit('notification', notification);
        }

        // Push notification
        if (admin.pushToken) {
          await sendPushNotification(
            admin.pushToken,
            this.formatAdminTitle(title),
            message
          );
        }

        notifications.push(notification);
      }

      return notifications;
    } catch (error) {
      console.error('Admin notification failed:', error);
    }
  }

  async notifyAdminsNewUser(user) {
    const message = `A new user just signed up.\n\nName: ${user.firstName || 'N/A'}\nEmail: ${user.email}`;

    return this.notifyAdmins({
      title: 'New User Signup',
      message,
    });
  }

  async notifyCustomerOrderPlaced(user, order) {
    return this.sendNotification({
      userId: user._id,
      title: '🛒 Order Confirmed',
      message: `Hi ${user.firstName}, your order #${order._id
        .toString()
        .slice(-6)} has been received and is being processed.`,
    });
  }

  async sendWelcomeNotification(userId) {
    return this.sendNotification({
      userId,
      title: "🎉 Welcome to CediMart",
      message: "Your campus marketplace is here! Shop, sell, and connect with trusted students around you.",
    });
  }

  async notifyAdminsNewOrder(order, customer) {
    const admins = await User.find({  role: "admin" }).select('_id role');

    const promises = admins.map((admin) => {
      const message = this.resolveRoleMessage({
        role: admin.role,
        templates: {
          superadmin: `New order placed by ${customer.firstName} (${customer.phone}). Total Ghc${order.totalPrice}`,
          manager: `New customer order received. Order ID: ${order._id
            .toString()
            .slice(-6)}`,
        },
        fallback: `New order received.`,
      });

      return this.sendNotification({
        userId: admin._id,
        title: this.formatAdminTitle('New Order'),
        message,
      });
    });

    return Promise.all(promises);
  }

  async notifyCustomerOrderStatusUpdated(order, oldStatus) {
    try {
      if (!order?.user?._id) return null;

      const statusMessages = {
        Pending: "🕒 Your order is pending confirmation.",
        Processing: "👨‍🍳 Your order is being prepared.",
        "Out for Delivery": "🚚 Your order is on the way!",
        Delivered: "✅ Your order has been delivered. Enjoy!",
        Cancelled: "❌ Your order has been cancelled.",
      };

      const shortOrderId = order._id.toString().slice(-6);

      const message =
        statusMessages[order.status] ||
        `Your order #${shortOrderId} status has been updated to ${order.status}.`;

      return this.sendNotification({
        userId: order.user._id,
        title: "📦 Order Status Updated",
        message: `Order #${shortOrderId}\n\n${message}`,
      });
    } catch (error) {
      console.error("Order status notification failed:", error);
      return null;
    }
  }

  async sendCancellationNotification(userId, order, reason) {
    try {
      const shortOrderId = order._id.toString().slice(-6);

      const customer = await User.findById(userId);

      await this.sendNotification({
        userId: customer._id,
        title: "❌ Order Cancelled",
        message: `Your order #${shortOrderId} has been cancelled successfully.${
          reason ? `\n\nReason: ${reason}` : ""
        }`,
      });

      const admins = await User.find({ role: "admin" }).select(
        "_id role pushToken"
      );

      const adminNotifications = admins.map((admin) => {
        const message = this.resolveRoleMessage({
          role: admin.role,
          templates: {
            superadmin: `Customer ${customer.firstName} (${customer.phone}) cancelled order #${shortOrderId}.\nReason: ${
              reason || "No reason provided"
            }`,
            manager: `Order #${shortOrderId} has been cancelled by customer.`,
          },
          fallback: `Order #${shortOrderId} was cancelled.`,
        });

        return this.sendNotification({
          userId: admin._id,
          title: this.formatAdminTitle("Order Cancelled"),
          message,
        });
      });

      await Promise.all(adminNotifications);

      return true;
    } catch (error) {
      console.error("Cancellation notification error:", error);
      return null;
    }
  }

  async adminNotifyUsersByRole({ role, title, message }) {
    try {
      const query =
        role === 'all'
          ? { role: { $in: ['customer', 'vendor'] } }
          : { role };

      const users = await User.find(query).select('_id');

      for (const user of users) {
        await this.sendNotification({
          userId: user._id,
          title: this.formatAdminTitle(title),
          message
        });
      }

      console.log(`Admin notification sent to ${users.length} ${role} users`);
    } catch (error) {
      console.error('Admin notify users by role error:', error);
    }
  }

  async adminBroadcastNotification({ title, message }) {
    try {
      const users = await User.find({}).select('_id');

      for (const user of users) {
        await this.sendNotification({
          userId: user._id,
          title: this.formatAdminTitle(title),
          message
        });
      }

      console.log(`Admin broadcast sent to ${users.length} users`);
    } catch (error) {
      console.error('Admin broadcast notification error:', error);
    }
  }

  async sendReferralOrderNotification(userId, rewardAmount, productName) {
    return this.sendNotification({
      userId,
      title: "💰 Referral Order!",
      message: `Someone placed an order through your referral link! You'll earn GH₵ ${rewardAmount.toFixed(2)} once the delivery is confirmed.`,
      data: {
        type: 'referral_order',
        rewardAmount,
        productName,
      }
    });
  }

  async sendReferralRewardConfirmedNotification(userId, rewardAmount) {
    return this.sendNotification({
      userId,
      title: "Referral Reward Confirmed!",
      message: `GH₵ ${rewardAmount.toFixed(2)} from your referral has been added to your available balance. You can withdraw it anytime!`,
      data: {
        type: 'referral_confirmed',
        rewardAmount,
      }
    });
  }

  async sendReferralCancelledNotification(userId, rewardAmount) {
    return this.sendNotification({
      userId,
      title: "❌ Referral Cancelled",
      message: `A referral order was cancelled. The pending reward of GH₵ ${rewardAmount.toFixed(2)} has been removed.`,
      data: {
        type: 'referral_cancelled',
        rewardAmount,
      }
    });
  }
}

module.exports = NotificationService;
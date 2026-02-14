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
    return title?.startsWith('📢') ? title : `📢 ${title}`;
  }

  async sendNotification({ userId, title, message }) {
    try {
      const user = await User.findById(userId).select('pushToken');
      if (!user) return null;

      const notification = await NotificationModel.create({
        user: userId,
        title,
        message,
      });

      // Socket.IO
      if (this.socketIO) {
        this.socketIO.to(userId.toString()).emit('notification', notification);
      }

      // Push
      if (user.pushToken) {
        await sendPushNotification(user.pushToken, title, message);
      }

      return notification;
    } catch (error) {
      console.error('Notification error:', error);
      return null;
    }
  }


  // Send notification to all admins
async notifyAdmins({ title, message }) {
  try {
    const admins = await User.find({ isAdmin: true }).select('_id pushToken');

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

  
  async notifyAdminsNewOrder(order, customer) {
    const admins = await User.find({ isAdmin: true }).select('_id role');

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

async sendCancellationNotification(userId,order, reason) {
  try {
    const shortOrderId = order._id.toString().slice(-6);

    // Populate user if not populated
    const customer = await User.findById(userId)

    await this.sendNotification({
      userId: customer._id,
      title: "❌ Order Cancelled",
      message: `Your order #${shortOrderId} has been cancelled successfully.${
        reason ? `\n\nReason: ${reason}` : ""
      }`,
    });

    const admins = await User.find({ isAdmin: true }).select(
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


}

module.exports = NotificationService;

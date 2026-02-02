const {NotificationModel} = require('../model/NotificationModel');
const {sendPushNotification} = require('./expo-server-notification-sdk')
const User = require('../model/User');

class NotificationService {
  constructor(socketIO = null) {
    this.socketIO = socketIO;
  }

  /**
   * Sends a notification and optionally emits it via Socket.IO
   * @param {Object} options
   * @param {string} options.userId - Recipient user ID
   * @param {string} options.message - Notification message
   * @param {string} options.title - Notification title
   * @returns {Promise<Notification>} The created notification
   */

   
  resolveRoleMessage({ role, templates, fallback }) {
  if (!role) return fallback;

  return templates[role] || fallback;
 }


 formatAdminTitle(title) {
  return title?.startsWith('📢') ? title : `📢 ${title}`;
}


  async sendNotification({ userId, message, title }) {
    try {

       const user = await UserModel.findById(userId).select('pushToken');
       const pushToken = user?.pushToken;

      const notification = await NotificationModel.create({
        user: userId,
        message,
        title
      });

      // Emit via Socket.IO if available
      if (this.socketIO) {
        this.socketIO.to(userId.toString()).emit('notification', notification);
        console.log(`Socket notification sent to user ${userId}`);
      }

      if (pushToken) {
        await sendPushNotification(pushToken, title, message);
        console.log(`Push notification sent to user ${userId}`);
      } else {
        console.log(`No push token found for user ${userId}, skipping push notification`);
      }
      
      await notification.save();
      return notification;
    } catch (error) {
      console.log('Failed to send notification', { error, userId });
      throw new Error('Failed to send notification');
    }
  }

}

module.exports = NotificationService
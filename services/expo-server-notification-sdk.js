const { Expo } = require("expo-server-sdk");
const expo = new Expo();

const sendPushNotification= async(pushToken, title, body) => {
  if (!Expo.isExpoPushToken(pushToken)) {
    console.error("Invalid Expo push token:", pushToken);
    return;
  }

  const message = {
    to: pushToken,
    sound: "default",
    title,
    body,
    data: { someData: "Custom payload" },
  };

  try {
    const tickets = await expo.sendPushNotificationsAsync([message]);

   
  } catch (err) {
    console.error("Error sending push notification:", err);
  }
}

module.exports = {sendPushNotification}

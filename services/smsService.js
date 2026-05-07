const axios = require("axios");

const NALO_URL = "https://sms.nalosolutions.com/smsbackend/Resl_Nalo/send-message/";
const NALO_KEY = process.env.NALO_API_KEY;
const SENDER_ID = "CediMart";

// Format phone (reuse your function if you want)
const formatPhoneNumber = (phone) => {
  if (!phone.startsWith("+")) {
    if (phone.startsWith("0")) {
      return "+233" + phone.slice(1);
    }
    return "+233" + phone;
  }
  return phone;
};

const sendSMS = async (phoneNumber, message) => {
  try {
    const formattedPhone = formatPhoneNumber(phoneNumber);

    const response = await axios.post(NALO_URL, {
      key: NALO_KEY,
      msisdn: formattedPhone,
      message,
      sender_id: SENDER_ID,
    });

    return { success: true, data: response.data };
  } catch (error) {
    console.error("SMS Error:", error.response?.data || error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendSMS,
};
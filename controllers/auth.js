// controllers/authController.js
const axios = require("axios");
const crypto = require("crypto");
const User = require('../model/User')
const redis = require("../config/redis");

const NALO_KEY = process.env.NALO_API_KEY;
const SENDER_ID = "CediMart";


const formatPhoneNumber = (phone) => {
  if (!phone.startsWith("+")) {
    
    if (phone.startsWith("0")) {
      return "+233" + phone.slice(1);
    }
    return "+233" + phone;
  }
  return phone;
};

const sendOTP = async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ error: "Phone number is required" });
  }

  const user = await User.findOne({phone: phoneNumber });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }


  const formattedPhone = formatPhoneNumber(phoneNumber);

  const redisKey = `otp:${formattedPhone}`;

  const existing = await redis.get(redisKey);
  if (existing) {
    return res.status(429).json({
      error: "OTP already sent. Please wait for few minutes before requesting again.",
    });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

 
  const hashedOTP = crypto.createHash("sha256").update(otp).digest("hex");

  // Store in Redis with TTL (5 mins)
    await redis.set(
    redisKey,
    JSON.stringify({
    otp: hashedOTP,
    attempts: 0,
    }),
  "EX", 300
);

  try {
    const message = `Your CediMart verificaction code is: ${otp}. Valid for 5 minutes. Please don't share this code with anyone.`;

    await axios.post(
      "https://sms.nalosolutions.com/smsbackend/Resl_Nalo/send-message/",
      {
        key: NALO_KEY,
        msisdn: formattedPhone,
        message,
        sender_id: SENDER_ID,
      }
    );

    res.status(200).json({ success: true, message: "OTP sent" });
  } catch (error) {
    console.log(error)
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: "Failed to send SMS" });
  }
};



const sendVendorOTP = async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ error: "Phone number is required" });
  }


  const formattedPhone = formatPhoneNumber(phoneNumber);

  const redisKey = `otp:${formattedPhone}`;

  const existing = await redis.get(redisKey);
  if (existing) {
    return res.status(429).json({
      error: "OTP already sent. Please wait for few minutes before requesting again.",
    });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

 
  const hashedOTP = crypto.createHash("sha256").update(otp).digest("hex");

  // Store in Redis with TTL (5 mins)
    await redis.set(
    redisKey,
    JSON.stringify({
    otp: hashedOTP,
    attempts: 0,
    }),
  "EX", 300
);

  try {
    const message = `Your CediMart verificaction code is: ${otp}. Valid for 5 minutes. Please don't share this code with anyone.`;

    await axios.post(
      "https://sms.nalosolutions.com/smsbackend/Resl_Nalo/send-message/",
      {
        key: NALO_KEY,
        msisdn: formattedPhone,
        message,
        sender_id: SENDER_ID,
      }
    );

    res.status(200).json({ success: true, message: "OTP sent" });
  } catch (error) {
    console.log(error)
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: "Failed to send SMS" });
  }
};



const verifyOTP = async (req, res) => {
  const { phoneNumber, otp } = req.body;

  const formattedPhone = formatPhoneNumber(phoneNumber);
  const redisKey = `otp:${formattedPhone}`;

  const data = await redis.get(redisKey);

   if (!data) {
    return res.status(400).json({ error: "OTP expired or not found" });
  }

  const parsed = JSON.parse(data);

   if (parsed.attempts >= 5) {
    await redis.del(redisKey);
    return res.status(429).json({ error: "Too many attempts. Request new OTP." });
  }

  // Hash incoming OTP
  const hashedOTP = crypto.createHash("sha256").update(otp).digest("hex");

  if (hashedOTP !== parsed.otp) {
    // increment attempts
    parsed.attempts += 1;

    await redis.set(redisKey, JSON.stringify(parsed), {
      EX: 300,
    });

    return res.status(400).json({ error: "Invalid OTP" });
  }
  // OTP verified — allow reset
await redis.del(redisKey);

  res.status(200).json({
    success: true,
    message: "OTP verified",
  });
};



const resetPassword = async (req, res) => {
  const { phoneNumber, newPassword } = req.body;

  // Find user
  const user = await User.findOne({phone: phoneNumber });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  // Hash password
  const bcrypt = require("bcryptjs");
  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(newPassword, salt);

  await user.save();

  res.status(200).json({
    success: true,
    message: "Password reset successful",
  });
};

module.exports = { sendOTP,sendVendorOTP, verifyOTP,resetPassword };
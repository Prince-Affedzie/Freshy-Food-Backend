const { sendOTP, verifyOTP,resetPassword } = require("../controllers/auth");
const express = require("express");
const authRouter = express.Router();


authRouter.post('/send-otp', sendOTP);
authRouter.post('/verify-otp', verifyOTP);
authRouter.post('/reset-password', resetPassword);

module.exports = authRouter;
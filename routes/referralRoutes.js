
const express = require("express");
const referralRouter  = express.Router();
const {generateReferralLink,trackReferralClick,getMyReferralStats,
     attachReferralToOrder, confirmReferralReward,cancelReferralReward,
     withdrawToMomo,convertToShoppingCredit,getVendorReferralStats,updateProductCommission}   
    = require("../controllers/referralController");

const { auth } = require('../middleware/auth');



referralRouter.get("/referrals/track/:code", trackReferralClick);

// ── Authenticated user routes ─────────────────────────────────────────────────
referralRouter.post("/referrals/generate",  auth, generateReferralLink);
referralRouter.get("/referrals/my-stats",   auth, getMyReferralStats);
referralRouter.post("/wallet/withdraw",    auth, withdrawToMomo);
referralRouter.post("/wallet/use-as-credit",auth, convertToShoppingCredit);

// ── Authenticated vendor routes ───────────────────────────────────────────────
referralRouter.get("/vendor/referral-stats", auth, getVendorReferralStats);
referralRouter.patch("/products/:id/commission", auth, updateProductCommission);

module.exports = referralRouter;

// ─────────────────────────────────────────────────────────────────────────────
// HOOK INTO YOUR EXISTING ORDER CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────
//
// In your existing createOrder controller, add these two lines:
//
//   const { attachReferralToOrder } = require("./referralController");
//
//   // After order is saved successfully:
//   await attachReferralToOrder(order._id, req.cookies?.cm_ref, order.totalPrice);
//
//
// In your existing order delivery-confirmation / buyer-confirms-receipt handler:
//
//   const { confirmReferralReward } = require("./referralController");
//   await confirmReferralReward(order._id);
//
//
// In your existing order cancellation / refund handler:
//
//   const { cancelReferralReward } = require("./referralController");
//   await cancelReferralReward(order._id);
//
//
// COOKIE — make sure cookie-parser is set up in app.js:
//   const cookieParser = require("cookie-parser");
//   app.use(cookieParser());
//
// The landing page (landing.html) sets:
//   document.cookie = `cm_ref=${code}; max-age=${30*24*60*60}; path=/; SameSite=Lax`;
// This cookie arrives with every subsequent API request from the browser/webview.
// ─────────────────────────────────────────────────────────────────────────────
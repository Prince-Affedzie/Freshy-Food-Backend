// models/Referral.js
const mongoose = require("mongoose");

const referralSchema = new mongoose.Schema(
  {
    // Short code embedded in the share link  (?ref=93JKD2)
    referralCode: {
      type: String, required: true, unique: true, index: true,
    },

    // User who shared the link
    sharerId: {
      type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true,
    },

    // Product being recommended
    productId: {
      type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true,
    },

    // Vendor who owns the product (snapshotted so commission resolves even
    // if the product is later deleted)
    vendorId: {
      type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true,
    },

    // Commission % at time of sharing — snapshot so the vendor changing their
    // rate later doesn't retroactively affect already-generated referral links
    commissionPct: {
      type: Number, required: true, min: 0, max: 100,
    },

    // Populated on first click, not on generation
    clickedAt: { type: Date, default: null },

    // 30 days from clickedAt — set when the link is first clicked
    expiresAt: { type: Date, default: null, index: true },

    // Total click count (one referral link can be clicked by many people;
    // only the FIRST purchase within the window converts)
    clickCount: { type: Number, default: 0 },

    // Populated when an order is placed via this referral
    convertedOrderId: {
      type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null,
    },
    convertedAt: { type: Date, default: null },

    // GH₵ reward — computed on conversion  (orderTotal × commissionPct / 100)
    rewardAmount: { type: Number, default: null },

    // Lifecycle:  generated → clicked → ordered → confirmed → rewarded
    //                                                        ↘ expired
    status: {
      type: String,
      enum: ["generated", "clicked", "ordered", "confirmed", "rewarded", "expired"],
      default: "generated",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Referral", referralSchema);
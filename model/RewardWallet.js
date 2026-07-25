// models/RewardWallet.js
// One wallet per user — created automatically on first referral conversion.
const mongoose = require("mongoose");

// ─── Wallet ──────────────────────────────────────────────────────────────────
const rewardWalletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    // Spendable right now (delivery confirmed, not yet withdrawn)
    availableBalance: { type: Number, default: 0, min: 0 },

    // Awaiting buyer's delivery confirmation before being released
    pendingBalance: { type: Number, default: 0, min: 0 },

    // Lifetime totals — for the UI's "You've earned GH₵ X total" display
    totalEarned:    { type: Number, default: 0 },
    totalWithdrawn: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// ─── Transaction ledger ───────────────────────────────────────────────────────
// One record per wallet event so the user can see exactly what happened when.
const walletTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "referral_pending",    // order placed via referral → reward enters pending
        "referral_confirmed",  // delivery confirmed → pending moves to available
        "referral_expired",    // order cancelled/refunded → pending removed
        "withdrawal_momo",     // withdrawn to mobile money
        "shopping_credit",     // converted to in-app shopping credit
      ],
      required: true,
    },

    amount: { type: Number, required: true },   // always positive

    // References
    referralId: { type: mongoose.Schema.Types.ObjectId, ref: "Referral", default: null },
    orderId:    { type: mongoose.Schema.Types.ObjectId, ref: "Order",    default: null },

    // Withdrawal-specific
    status:     { type: String, enum: ["pending", "completed", "failed"], default: "completed" },
    momoPhone:  { type: String, default: null },
    momoRef:    { type: String, default: null },   // payment provider reference

    // Human-readable description shown in the wallet transactions list
    description: { type: String },
  },
  { timestamps: true }
);

const RewardWallet      = mongoose.model("RewardWallet",      rewardWalletSchema);
const WalletTransaction = mongoose.model("WalletTransaction", walletTransactionSchema);

module.exports = { RewardWallet, WalletTransaction };
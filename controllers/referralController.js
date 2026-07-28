// controllers/referralController.js
const crypto     = require("crypto");
const Referral   = require("../model/Referral");
const { RewardWallet, WalletTransaction } = require("../model/RewardWallet");
const Product    = require("../model/Product");
const User       = require("../model/User");
const Order      = require("../model/Order");  

const BASE_URL = process.env.APP_WEB_BASE_URL || "https://cedi-mart-web.vercel.app";
const REFERRAL_WINDOW_DAYS = 30;

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Generate a unique 7-char alphanumeric code.
const generateCode = () => crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 7);

// Ensure the user has a stable personal referral seed on their User doc.
// We generate one lazily (on first share) rather than on signup, so legacy
// accounts get one automatically without a migration.
const ensureUserReferralCode = async (userId) => {
  const user = await User.findById(userId);
  if (user.referralCode) return user.referralCode;
  let code;
  let attempts = 0;
  do {
    code = generateCode();
    attempts++;
    if (attempts > 10) throw new Error("Could not generate unique referral code");
  } while (await Referral.exists({ referralCode: code }));
  user.referralCode = code;
  await user.save();
  return code;
};

// Upsert a wallet record for a user (creates it if it doesn't exist yet).
const getOrCreateWallet = async (userId) => {
  let wallet = await RewardWallet.findOne({ userId });
  if (!wallet) wallet = await RewardWallet.create({ userId });
  return wallet;
};

// ─── 1. Generate a referral link for a product ───────────────────────────────
/**
 * POST /api/referrals/generate
 * Body: { productId }
 * Auth: required
 *
 * Returns the shareable URL with the referral code embedded.
 * If this user has already generated a code for this exact product,
 * return the existing one (idempotent).
 */
const generateReferralLink = async (req, res) => {
  try {
    const { productId } = req.body;
    const sharerId = req.user._id || req.user.id;

    // Load the product to snapshot the commission rate
    const product = await Product.findById(productId).populate("vendor", "_id");
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    if (!product.isAvailable) {
      return res.status(400).json({ success: false, message: "This product is no longer available" });
    }

    // Vendors cannot refer their own products (prevents self-commission abuse)
    const vendorUserId = product.vendor?.user?.toString() || product.vendor?._id?.toString();
    if (vendorUserId === sharerId.toString()) {
      return res.status(400).json({ success: false, message: "You cannot refer your own product" });
    }

    // Re-use an existing generated/clicked referral for this sharer + product
    let referral = await Referral.findOne({
      sharerId,
      productId,
      status: { $in: ["generated", "clicked"] },
    });

    if (!referral) {
      const code = await ensureUserReferralCode(sharerId);
      // Make the per-product code unique: userCode + productId fragment
      const productFragment = productId.toString().slice(-4).toUpperCase();
      const uniqueCode = `${code}${productFragment}`;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      referral = await Referral.create({
        referralCode: uniqueCode,
        sharerId,
        productId,
        vendorId:     product.vendor._id,
        commissionPct: product.commissionPct || 3,
        status: "generated",
        expiresAt, 
      });
    }

    const shareUrl = `${BASE_URL}/product/${productId}?ref=${referral.referralCode}`;

    return res.json({
      success: true,
      data: {
        shareUrl,
        referralCode: referral.referralCode,
        commissionPct: referral.commissionPct,
        productName: product.name,
        productPrice: product.price,
        estimatedEarning: ((product.price * referral.commissionPct) / 100).toFixed(2),
        expiresAt: referral.expiresAt, 
      },
    });
  } catch (err) {
    console.error("generateReferralLink error:", err);
    return res.status(500).json({ success: false, message: "Could not generate referral link" });
  }
};

// ─── 2. Track a referral link click (called by the landing page) ─────────────
/**
 * GET /api/referrals/track/:code
 * Public (no auth required — the visitor may not have the app yet)
 *
 * - Marks the referral as "clicked" (first time only)
 * - Sets the 30-day expiry window
 * - Returns product + recommender preview data for the landing page banner
 */
const trackReferralClick = async (req, res) => {
  try {
    const { code } = req.params;

    const referral = await Referral.findOne({ referralCode: code })
      .populate("sharerId",  "firstName lastName")
      .populate("productId", "name price images condition campus");

    if (!referral) {
      return res.status(404).json({ success: false, message: "Invalid referral link" });
    }

    // First click — start the 30-day window
    if (referral.status === "generated") {
      referral.status    = "clicked";
      referral.clickedAt = new Date();
      referral.expiresAt = new Date(Date.now() + REFERRAL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    }

    // Count every click for analytics, even repeated ones
    referral.clickCount += 1;
    await referral.save();

    const sharer  = referral.sharerId;
    const product = referral.productId;

    return res.json({
      success: true,
      data: {
        referralCode:   code,
        recommenderName: sharer ? `${sharer.firstName} ${sharer.lastName}` : "A CediMart user",
        product: product ? {
          _id:       product._id,
          name:      product.name,
          price:     product.price,
          image:     product.images?.[0] || null,
          condition: product.condition,
          campus:    product.campus,
        } : null,
        expiresAt:     referral.expiresAt,
      },
    });
  } catch (err) {
    console.error("trackReferralClick error:", err);
    return res.status(500).json({ success: false, message: "Could not track referral" });
  }
};

// ─── 3. Attach referral to an order (called from order creation) ──────────────
/**
 * Called internally from your existing order controller — NOT a public route.
 *
 * Usage in your order controller:
 *   const { attachReferralToOrder } = require("./referralController");
 *   await attachReferralToOrder(order._id, req.cookies?.cm_ref, order.totalPrice);
 */
const attachReferralToOrder = async (orderId, referralCode, orderTotal) => {
 console.log("I'm working")
 console.log("referralCode", referralCode)
  if (!referralCode) return;
  try {
    const referral = await Referral.findOne({
      referralCode,
      //expiresAt: { $gt: new Date() },     // within the 30-day window
      convertedOrderId: null,              // not already converted
    });
    if (!referral) return;  // expired, invalid, or already used

    const rewardAmount = parseFloat(((orderTotal * referral.commissionPct) / 100).toFixed(2));

    referral.status           = "ordered";
    referral.convertedOrderId = orderId;
    referral.convertedAt      = new Date();
    referral.rewardAmount     = rewardAmount;
    await referral.save();

    // Move reward to PENDING wallet — it becomes available after delivery confirmation
    const wallet = await getOrCreateWallet(referral.sharerId);
    wallet.pendingBalance = parseFloat((wallet.pendingBalance + rewardAmount).toFixed(2));
    await wallet.save();

    await WalletTransaction.create({
      userId:      referral.sharerId,
      type:        "referral_pending",
      amount:      rewardAmount,
      referralId:  referral._id,
      orderId,
      status:      "pending",
      description: `Reward pending — waiting for delivery confirmation`,
    });
  } catch (err) {
    // Non-fatal: a referral tracking failure must never block an order
    console.error("attachReferralToOrder error:", err);
  }
};

// ─── 4. Confirm reward after delivery (called from order delivery hook) ───────
/**
 * Called internally when the buyer confirms receipt or delivery is marked complete.
 *
 * Usage in your order controller's delivery-confirmation handler:
 *   const { confirmReferralReward } = require("./referralController");
 *   await confirmReferralReward(order._id);
 */
const confirmReferralReward = async (orderId) => {
  try {
    const referral = await Referral.findOne({
      convertedOrderId: orderId,
      status: "ordered",
    });
    if (!referral) return;

    referral.status = "confirmed";
    await referral.save();

    const wallet = await getOrCreateWallet(referral.sharerId);

    // Move from pending → available
    wallet.pendingBalance   = Math.max(0, parseFloat((wallet.pendingBalance - referral.rewardAmount).toFixed(2)));
    wallet.availableBalance = parseFloat((wallet.availableBalance + referral.rewardAmount).toFixed(2));
    wallet.totalEarned      = parseFloat((wallet.totalEarned + referral.rewardAmount).toFixed(2));
    await wallet.save();

    // Mark the pending transaction as completed and log the confirmed credit
    await WalletTransaction.findOneAndUpdate(
      { referralId: referral._id, type: "referral_pending" },
      { status: "completed", description: "Reward pending — delivery confirmed" }
    );

    await WalletTransaction.create({
      userId:      referral.sharerId,
      type:        "referral_confirmed",
      amount:      referral.rewardAmount,
      referralId:  referral._id,
      orderId,
      status:      "completed",
      description: `GH₵ ${referral.rewardAmount} earned from recommendation`,
    });

    // Mark as fully rewarded
    referral.status = "rewarded";
    await referral.save();
  } catch (err) {
    console.error("confirmReferralReward error:", err);
  }
};

// ─── 5. Expire a referral if the order is cancelled/refunded ─────────────────
/**
 * Called when an order is cancelled or refunded.
 */
const cancelReferralReward = async (orderId) => {
  try {
    const referral = await Referral.findOne({ convertedOrderId: orderId, status: "ordered" });
    if (!referral) return;

    referral.status = "expired";
    await referral.save();

    const wallet = await getOrCreateWallet(referral.sharerId);
    wallet.pendingBalance = Math.max(0, parseFloat((wallet.pendingBalance - referral.rewardAmount).toFixed(2)));
    await wallet.save();

    await WalletTransaction.create({
      userId:      referral.sharerId,
      type:        "referral_expired",
      amount:      referral.rewardAmount,
      referralId:  referral._id,
      orderId,
      status:      "completed",
      description: "Reward removed — order was cancelled or refunded",
    });
  } catch (err) {
    console.error("cancelReferralReward error:", err);
  }
};

// ─── 6. My referral stats (for the user-facing wallet screen) ─────────────────
/**
 * GET /api/referrals/my-stats
 * Auth: required
 */
const getMyReferralStats = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;

    const [wallet, referrals] = await Promise.all([
      getOrCreateWallet(userId),
      Referral.find({ sharerId: userId })
        .sort({ createdAt: -1 })
        .limit(50)
        .populate("productId", "name price images"),
    ]);

    const transactions = await WalletTransaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(30);

    const stats = {
      totalShares:    referrals.length,
      totalClicks:    referrals.reduce((sum, r) => sum + r.clickCount, 0),
      totalPurchases: referrals.filter(r => ["ordered", "confirmed", "rewarded"].includes(r.status)).length,
      conversionRate: referrals.length
        ? ((referrals.filter(r => r.status !== "clicked" && r.status !== "generated").length / Math.max(1, referrals.filter(r => r.clickCount > 0).length)) * 100).toFixed(1)
        : "0.0",
    };

    return res.json({
      success: true,
      data: {
        wallet: {
          availableBalance: wallet.availableBalance,
          pendingBalance:   wallet.pendingBalance,
          totalEarned:      wallet.totalEarned,
          totalWithdrawn:   wallet.totalWithdrawn,
        },
        stats,
        referrals: referrals.map(r => ({
          _id:          r._id,
          referralCode: r.referralCode,
          status:       r.status,
          clickCount:   r.clickCount,
          rewardAmount: r.rewardAmount,
          commissionPct: r.commissionPct,
          createdAt:    r.createdAt,
          expiresAt:    r.expiresAt,
          product: r.productId ? {
            name:  r.productId.name,
            price: r.productId.price,
            image: r.productId.images?.[0],
          } : null,
        })),
        transactions: transactions.map(t => ({
          _id:         t._id,
          type:        t.type,
          amount:      t.amount,
          status:      t.status,
          description: t.description,
          createdAt:   t.createdAt,
        })),
      },
    });
  } catch (err) {
    console.error("getMyReferralStats error:", err);
    return res.status(500).json({ success: false, message: "Could not fetch stats" });
  }
};

// ─── 7. Withdraw to Mobile Money ──────────────────────────────────────────────
/**
 * POST /api/wallet/withdraw
 * Body: { amount, momoPhone, network }
 * Auth: required
 */
const withdrawToMomo = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { amount, momoPhone, network } = req.body;

    const wallet = await RewardWallet.findOne({ userId });
    if (!wallet) return res.status(404).json({ success: false, message: "Wallet not found" });

    if (amount < 1) {
      return res.status(400).json({ success: false, message: "Minimum withdrawal is GH₵ 1" });
    }
    if (wallet.availableBalance < amount) {
      return res.status(400).json({ success: false, message: "Insufficient balance" });
    }

    // TODO: integrate with your payment provider (Paystack, Hubtel, etc.)
    // For now, record the transaction and deduct the balance
    wallet.availableBalance = parseFloat((wallet.availableBalance - amount).toFixed(2));
    wallet.totalWithdrawn   = parseFloat((wallet.totalWithdrawn + amount).toFixed(2));
    await wallet.save();

    const txn = await WalletTransaction.create({
      userId,
      type:        "withdrawal_momo",
      amount,
      status:      "pending",   // becomes "completed" after payment provider callback
      momoPhone,
      description: `Withdrawal to ${network} · ${momoPhone}`,
    });

    // ── PAYMENT PROVIDER HOOK ──────────────────────────────────────────────
    // Example with Paystack Transfers API:
    // await initiatePaystackTransfer({ amount: amount * 100, recipient: momoPhone, reason: "CediMart reward withdrawal" });

    return res.json({
      success: true,
      message: `GH₵ ${amount} withdrawal initiated to ${momoPhone}`,
      transactionId: txn._id,
    });
  } catch (err) {
    console.error("withdrawToMomo error:", err);
    return res.status(500).json({ success: false, message: "Withdrawal failed" });
  }
};

// ─── 8. Convert balance to Shopping Credit ────────────────────────────────────
/**
 * POST /api/wallet/use-as-credit
 * Body: { amount }
 * Auth: required
 */
const convertToShoppingCredit = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { amount } = req.body;

    const wallet = await RewardWallet.findOne({ userId });
    if (!wallet || wallet.availableBalance < amount) {
      return res.status(400).json({ success: false, message: "Insufficient balance" });
    }

    wallet.availableBalance = parseFloat((wallet.availableBalance - amount).toFixed(2));
    wallet.totalWithdrawn   = parseFloat((wallet.totalWithdrawn + amount).toFixed(2));
    await wallet.save();

    await WalletTransaction.create({
      userId,
      type:   "shopping_credit",
      amount,
      status: "completed",
      description: `GH₵ ${amount} converted to shopping credit`,
    });

    // TODO: add the shopping credit to the user's account in your checkout flow
    // e.g. user.shoppingCredit += amount; await user.save();

    return res.json({ success: true, message: `GH₵ ${amount} added to your shopping credit` });
  } catch (err) {
    console.error("convertToShoppingCredit error:", err);
    return res.status(500).json({ success: false, message: "Could not convert balance" });
  }
};

// ─── 9. Vendor referral dashboard ─────────────────────────────────────────────
/**
 * GET /api/vendor/referral-stats
 * Auth: vendor required
 */
const getVendorReferralStats = async (req, res) => {
  try {
    const userId = req.user
    const vendor = await Vendor.findOne({user:userId})

    const referrals = await Referral.find({ vendorId:vendor._id })
      .sort({ createdAt: -1 })
      .populate("productId", "name price");

    const totalShares    = referrals.length;
    const totalClicks    = referrals.reduce((s, r) => s + r.clickCount, 0);
    const totalPurchases = referrals.filter(r => !["generated", "clicked"].includes(r.status)).length;
    const totalRevenue   = referrals
      .filter(r => !["generated", "clicked"].includes(r.status))
      .reduce((s, r) => s + (r.rewardAmount / r.commissionPct * 100), 0);
    const commissionPaid = referrals
      .filter(r => r.status === "rewarded")
      .reduce((s, r) => s + (r.rewardAmount || 0), 0);

    return res.json({
      success: true,
      data: {
        summary: {
          totalShares,
          totalClicks,
          totalPurchases,
          totalRevenue:   parseFloat(totalRevenue.toFixed(2)),
          commissionPaid: parseFloat(commissionPaid.toFixed(2)),
          conversionRate: totalClicks ? ((totalPurchases / totalClicks) * 100).toFixed(1) : "0.0",
        },
        referrals: referrals.slice(0, 50).map(r => ({
          productName:   r.productId?.name,
          commissionPct: r.commissionPct,
          clickCount:    r.clickCount,
          status:        r.status,
          rewardAmount:  r.rewardAmount,
          createdAt:     r.createdAt,
        })),
      },
    });
  } catch (err) {
    console.error("getVendorReferralStats error:", err);
    return res.status(500).json({ success: false, message: "Could not fetch vendor stats" });
  }
};

// ─── 10. Update commission % on a product ─────────────────────────────────────
/**
 * PATCH /api/products/:id/commission
 * Body: { commissionPct }   (integer, 3–15)
 * Auth: vendor who owns the product
 */
const updateProductCommission = async (req, res) => {
  try {
    const { id }            = req.params;
    const { commissionPct } = req.body;
    //const userId          = req.user._id || req.vendor.id;
    const vendor = await Vendor.findOne({user:userId})

    if (commissionPct < 3 || commissionPct > 15) {
      return res.status(400).json({ success: false, message: "Commission must be between 3% and 15%" });
    }

    const product = await Product.findOne({ _id: id,vendor:vendor._id});
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    product.commissionPct   = commissionPct;
    product.commissionTier  = commissionPct >= 8 ? "featured" : "normal";
    await product.save();

    return res.json({ success: true, data: { commissionPct: product.commissionPct, tier: product.commissionTier } });
  } catch (err) {
    console.error("updateProductCommission error:", err);
    return res.status(500).json({ success: false, message: "Could not update commission" });
  }
};


module.exports = {generateReferralLink,trackReferralClick,getMyReferralStats,
    attachReferralToOrder, confirmReferralReward,cancelReferralReward,
    withdrawToMomo,convertToShoppingCredit,getVendorReferralStats,updateProductCommission}
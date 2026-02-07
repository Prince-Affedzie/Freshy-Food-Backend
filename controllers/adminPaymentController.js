const { Payment } = require('../model/PaymentModel');
const Order = require('../model/Order');
const User = require('../model/User');

/* ================================
   1. PAYMENT OVERVIEW (DASHBOARD)
================================ */
const getPaymentOverview = async (req, res) => {
  try {
    const summary = await Payment.aggregate([
      {
        $group: {
          _id: '$status',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const totalRevenueAgg = await Payment.aggregate([
      { $match: { status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        summary,
        totalRevenue: totalRevenueAgg[0]?.total || 0,
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment overview',
    });
  }
};

/* ================================
   2. LIST PAYMENTS (FILTERABLE)
================================ */
const getAllPayments = async (req, res) => {
  try {
    const {
      status,
      paymentMethod,
      startDate,
      endDate,
      page = 1,
      limit = 20
    } = req.query;

    const filter = {};

    if (status) filter.status = status;
    if (paymentMethod) filter.paymentMethod = paymentMethod;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const payments = await Payment.find(filter)
      .populate('user', 'firstName email phone')
      .populate('orderId', 'totalPrice status')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Payment.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: payments,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / limit),
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payments',
    });
  }
};

/* ================================
   3. GET SINGLE PAYMENT
================================ */
const getPaymentById = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('user', 'firstName email phone')
      .populate('orderId');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    res.status(200).json({
      success: true,
      data: payment,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment',
    });
  }
};

/* ================================
   4. UPDATE PAYMENT STATUS (ADMIN)
================================ */
const updatePaymentStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'processing', 'paid', 'failed', 'refunded'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment status',
      });
    }

    const payment = await Payment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    payment.status = status;
    await payment.save();

    // Sync order payment state
    if (payment.orderId && status === 'paid') {
      await Order.findByIdAndUpdate(payment.orderId, {
        isPaid: true,
        paidAt: new Date(),
      });
    }

    res.status(200).json({
      success: true,
      message: 'Payment status updated successfully',
      data: payment,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Failed to update payment status',
    });
  }
};

/* ================================
   5. REFUND PAYMENT (LOGICAL)
================================ */
const refundPayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);

    if (!payment || payment.status !== 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Only paid payments can be refunded',
      });
    }

    payment.status = 'refunded';
    await payment.save();

    // Optional: mark order as cancelled
    if (payment.orderId) {
      await Order.findByIdAndUpdate(payment.orderId, {
        status: 'Cancelled',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Payment refunded successfully',
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Refund failed',
    });
  }
};

module.exports = {
  getPaymentOverview,
  getAllPayments,
  getPaymentById,
  updatePaymentStatus,
  refundPayment,
};

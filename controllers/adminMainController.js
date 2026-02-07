const Order = require('../model/Order');
const Product = require('../model/Product');
const { Payment } = require('../model/PaymentModel');
const User = require('../model/User');

const getAdminDashboardData = async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    /* =====================
       BASIC COUNTS
    ====================== */
    const [
      totalUsers,
      totalOrders,
      totalProducts,
      totalRevenueAgg,
    ] = await Promise.all([
      User.countDocuments(),
      Order.countDocuments(),
      Product.countDocuments(),
      Payment.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    const totalRevenue = totalRevenueAgg[0]?.total || 0;

    /* =====================
       ORDERS ANALYTICS
    ====================== */
    const ordersByStatus = await Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const todayOrders = await Order.countDocuments({
      createdAt: { $gte: todayStart, $lte: todayEnd }
    });

    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('user', 'firstName email')
      .select('totalPrice status createdAt');

    /* =====================
       PAYMENT ANALYTICS
    ====================== */
    const paymentsSummary = await Payment.aggregate([
      {
        $group: {
          _id: '$status',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const todayRevenueAgg = await Payment.aggregate([
      {
        $match: {
          status: 'paid',
          createdAt: { $gte: todayStart, $lte: todayEnd }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const todayRevenue = todayRevenueAgg[0]?.total || 0;

    /* =====================
       PRODUCT ANALYTICS
    ====================== */
    const lowStockProducts = await Product.find({
      countInStock: { $lte: 5, $gt: 0 }
    }).select('name countInStock price');

    const outOfStockProducts = await Product.find({
      countInStock: 0
    }).select('name price');

    const topSellingProducts = await Order.aggregate([
      { $unwind: '$orderItems' },
      {
        $group: {
          _id: '$orderItems.product',
          totalSold: { $sum: '$orderItems.quantity' }
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          name: '$product.name',
          totalSold: 1
        }
      }
    ]);

    /* =====================
       RESPONSE
    ====================== */
    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalUsers,
          totalOrders,
          totalProducts,
          totalRevenue,
          todayOrders,
          todayRevenue,
        },

        orders: {
          byStatus: ordersByStatus,
          recent: recentOrders,
        },

        payments: {
          summary: paymentsSummary,
        },

        products: {
          lowStock: lowStockProducts,
          outOfStock: outOfStockProducts,
          topSelling: topSellingProducts,
        },
      },
    });

  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load admin dashboard data',
    });
  }
};

module.exports = {
  getAdminDashboardData,
};

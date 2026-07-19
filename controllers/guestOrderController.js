// src/controllers/guestOrderController.js
const GuestOrder = require('../model/GuestOrder');
const Product = require('../model/Product');
const Vendor = require('../model/Vendor');
const {sendSMS} = require('../services/smsService');
const {buildOrderSMS} = require('../Utils/smsOrderComfirmationTemp')

// ─── Create Guest Order ────────────────────────────────────────────────────────
const createGuestOrder = async (req, res) => {
    const notificationService = req.app.get("notificationService")
  try {
    const { 
      productId, 
      productName, 
      price, 
      customerName, 
      phone, 
      campus, 
      location 
    } = req.body;
    console.log(req.body)

    // Validate required fields
    if (!productId || !productName || !customerName || !phone || !campus || !location) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: productId, productName, customerName, phone, campus, location'
      });
    }

    // Validate phone number (Ghana format)
    const phoneRegex = /^0[2-9]\d{8}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid Ghana phone number (e.g., 0501234567)'
      });
    }

    // Verify product exists and is available
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found. It may have been removed.'
      });
    }

    if (!product.isAvailable) {
      return res.status(400).json({
        success: false,
        message: 'This product is no longer available.'
      });
    }

    if (product.countInStock < 1) {
      return res.status(400).json({
        success: false,
        message: 'This product is out of stock.'
      });
    }

    // Check for duplicate order (same phone + same product within 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingOrder = await GuestOrder.findOne({
      product: productId,
      phone:phone,
      createdAt: { $gte: twentyFourHoursAgo }
    });

    if (existingOrder) {
      return res.status(400).json({
        success: false,
        message: 'You already placed an order for this item.'
      });
    }

    // Create the guest order
    const guestOrder = await GuestOrder.create({
      product: productId,
      productName: product.name, // Use actual product name from DB for consistency
      price: product.price,
      //originalPrice: product.discountInfo?.isOnSale ? product.discountInfo.originalPrice : null,
      customerName: customerName,
      phone:phone,
      campus,
      location,
      status: 'pending',
      vendor: product.vendor,
    });

    // Populate minimal product info for response
    const populatedOrder = await GuestOrder.findById(guestOrder._id)
      .populate('product', 'name images price campus')
      .populate('vendor', 'name phone');

    // Update product views count
    await Product.findByIdAndUpdate(productId, { $inc: { views: 1 } });

    //await notificationService.notifyAdminsNewOrder(guestOrder);
    const sms_message = `Hello ${customerName}, your CediMart order #${guestOrder._id.toString().slice(-6)} has been received! We're getting your order ready for delivery. Thank you for shopping!`;
    await sendSMS(guestOrder.phone,sms_message)
    const message = `New Order #${guestOrder._id.toString().slice(-5)} received: You have ${guestOrder.productName} to prepare for delivery.`;
    await sendSMS(populatedOrder.vendor.phone, message);

    return res.status(200).json({
      success: true,
      message: 'Order placed successfully! The seller will contact you soon.',
      data: {
        orderId: guestOrder._id,
        productName: product.name,
        price: guestOrder.price,
        status: guestOrder.status,
        customerName:guestOrder.customerName,
        phone:guestOrder.phone,
        campus,
        location,
        createdAt: guestOrder.createdAt,
      }
    });

  } catch (error) {
    console.error('Create guest order error:', error);
    
    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to place order. Please try again later.'
    });
  }
};

// ─── Get Guest Order by ID ─────────────────────────────────────────────────────
const getGuestOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID'
      });
    }

    const order = await GuestOrder.findById(orderId)
      .populate('product', 'name images price campus condition images')
      .populate('vendor', 'name phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: order
    });

  } catch (error) {
    console.error('Get guest order error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch order details'
    });
  }
};

// ─── Get Guest Orders by Phone ─────────────────────────────────────────────────
const getGuestOrdersByPhone = async (req, res) => {
  try {
    const { phone } = req.params;

    const phoneRegex = /^0[2-9]\d{8}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid phone number'
      });
    }

    const orders = await GuestOrder.find({ phone })
      .populate('product', 'name images price campus')
      .sort({ createdAt: -1 }) // Most recent first
      .limit(20);

    return res.status(200).json({
      success: true,
      count: orders.length,
      data: orders
    });

  } catch (error) {
    console.error('Get guest orders by phone error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
};

// ─── Get Vendor's Guest Orders ─────────────────────────────────────────────────
const getVendorGuestOrders = async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID'
      });
    }

    // Optional filters
    const { status, page = 1, limit = 20 } = req.query;
    const filter = { vendor: vendorId };
    
    if (status && ['pending', 'contacted', 'completed', 'cancelled'].includes(status)) {
      filter.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const orders = await GuestOrder.find(filter)
      .populate('product', 'name images price')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await GuestOrder.countDocuments(filter);

    return res.status(200).json({
      success: true,
      count: orders.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      data: orders
    });

  } catch (error) {
    console.error('Get vendor guest orders error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
};

// ─── Update Guest Order Status (Vendor only) ───────────────────────────────────
const updateGuestOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, vendorNotes } = req.body;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID'
      });
    }

    const validStatuses = ['pending', 'contacted', 'completed', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${validStatuses.join(', ')}`
      });
    }

    const order = await GuestOrder.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Optional: Verify the vendor owns this order
    // if (order.vendor.toString() !== req.vendor._id.toString()) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Not authorized to update this order'
    //   });
    // }

    order.status = status;
    if (vendorNotes) order.vendorNotes = vendorNotes;
    
    await order.save();

    // TODO: Send SMS to customer about status update
    // if (status === 'contacted') {
    //   await sendSMS(order.phone, `CediMart: The seller has received your order #${orderId.slice(-6)} for "${order.productName}" and will contact you soon.`);
    // }

    return res.status(200).json({
      success: true,
      message: `Order marked as "${status}"`,
      data: order
    });

  } catch (error) {
    console.error('Update guest order status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update order status'
    });
  }
};

// ─── Cancel Guest Order (Customer) ─────────────────────────────────────────────
const cancelGuestOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { phone } = req.body;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID'
      });
    }

    const order = await GuestOrder.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Verify the phone matches
    if (order.phone !== phone) {
      return res.status(403).json({
        success: false,
        message: 'Phone number does not match the order'
      });
    }

    // Only allow cancellation of pending orders
    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel an order that is already "${order.status}"`
      });
    }

    order.status = 'cancelled';
    await order.save();

    return res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      data: order
    });

  } catch (error) {
    console.error('Cancel guest order error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel order'
    });
  }
};

// ─── Get Order Stats (for dashboard) ───────────────────────────────────────────
const getGuestOrderStats = async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID'
      });
    }

    const stats = await GuestOrder.aggregate([
      { $match: { vendor: new mongoose.Types.ObjectId(vendorId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalValue: { $sum: '$price' }
        }
      }
    ]);

    const totalOrders = stats.reduce((sum, s) => sum + s.count, 0);
    const totalValue = stats.reduce((sum, s) => sum + s.totalValue, 0);

    // Recent orders (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentOrders = await GuestOrder.countDocuments({
      vendor: vendorId,
      createdAt: { $gte: sevenDaysAgo }
    });

    return res.status(200).json({
      success: true,
      data: {
        totalOrders,
        totalValue,
        recentOrders,
        byStatus: stats.reduce((acc, s) => {
          acc[s._id] = { count: s.count, totalValue: s.totalValue };
          return acc;
        }, {})
      }
    });

  } catch (error) {
    console.error('Get guest order stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch order statistics'
    });
  }
};

module.exports = {
  createGuestOrder,
  getGuestOrderById,
  getGuestOrdersByPhone,
  getVendorGuestOrders,
  updateGuestOrderStatus,
  cancelGuestOrder,
  getGuestOrderStats
};
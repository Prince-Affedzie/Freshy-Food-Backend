const Order = require('../model/Order');
const Product = require('../model/Product');
const User = require('../model/User');
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const axios = require('axios');
const NotificationService = require('../services/notificationService');


// WhatsApp Business API configuration
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

// Helper function to format price
const formatPrice = (price) => {
  return price.toFixed(2);
};

// Helper function to format date
const formatDate = (date) => {
  if (!date) return 'Not set';
  return new Date(date).toLocaleDateString('en-GH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Helper function to generate order summary text for WhatsApp
const generateOrderSummary = (order) => {
  const itemsText = order.orderItems.map(item => 
    `• ${item.name}: ${item.quantity} ${item.unit} - ₵${(item.price * item.quantity).toFixed(2)}`
  ).join('\n');

  return `📦 *NEW ORDER #${order._id}*\n\n` +
    `👤 Customer: ${order.user?.name || 'N/A'}\n` +
    `📱 Phone: ${order.shippingAddress.phone}\n` +
    `📍 Address: ${order.shippingAddress.address}, ${order.shippingAddress.city}\n` +
    `🗓️ Delivery: ${formatDate(order.deliveryDate)}\n\n` +
    `🛒 *Items:*\n${itemsText}\n\n` +
    `💰 *Summary:*\n` +
    `Items Total: ₵${order.itemsPrice.toFixed(2)}\n` +
    `Delivery Fee: ₵${order.deliveryFee.toFixed(2)}\n` +
    `*Total: ₵${order.totalPrice.toFixed(2)}*\n\n` +
    `💳 Payment: ${order.paymentMethod} ${order.isPaid ? '✅ Paid' : '❌ Pending'}\n` +
    `🚚 Status: ${order.status}\n` +
    `⏰ Ordered: ${formatDate(order.createdAt)}`;
};


const createOrder = asyncHandler(async (req, res) => {
  const {id} = req.user
  const notificationService = req.app.get("notificationService");
  try {
    const {
      paymentId,
      orderItems,
      shippingAddress,
      paymentMethod,
      deliverySchedule,
      deliveryNote,
      package: packageInfo,
    } = req.body;

  
    let userId;
   
    let user = await User.findById(id);

    userId = user._id;

    if (!orderItems || orderItems.length === 0) {
      return res.status(400).json({ success: false, message: 'No order items' });
    }

    if (!shippingAddress?.address || !shippingAddress?.city || !shippingAddress?.phone) {
      return res.status(400).json({ success: false, message: 'Incomplete shipping address' });
    }
    // Validate products & calculate price
    const items = [];
    let itemsPrice = 0;
    let outOfStockItems = [];

    for (const item of orderItems) {
      const product = await Product.findById(item.productId || item.product);
      if (!product) {
        return res.status(400).json({ success: false, message: `Product not found: ${item.name}` });
      }
      if (!product.isAvailable ) {
        outOfStockItems.push({
          name: product.name,
          requested: item.quantity,
          available: product.countInStock
        });
      }

      items.push({
        name: product.name,
        quantity: item.quantity,
        unit: item.unit || 'unit',
        image: product.image || '',
        price: product.price,
        product: product._id
      });
      itemsPrice += product.price * item.quantity;
    }

    if (outOfStockItems.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Some items are out of stock',
        outOfStockItems
      });
    }

    const deliveryFee = calculateDeliveryFee(itemsPrice, shippingAddress.city);
    const totalPrice = itemsPrice + deliveryFee;

    // Create order
    const order = new Order({
      paymentId:paymentId,
      user: userId,
      orderItems: items,
      shippingAddress: {
        ...shippingAddress,
        region: shippingAddress.region || ''
      },
      deliverySchedule: {
        preferredDay: deliverySchedule.preferredDay,
        preferredTime: deliverySchedule.preferredTime
      },
      deliveryNote,
      itemsPrice,
      deliveryFee,
      isPaid:true,
      totalPrice,
      paymentMethod,
      status:'Processing',
      wasGuestCheckout: !req.user // mark if converted from guest
    });

    const createdOrder = await order.save();

    // Decrease stock
    for (const item of orderItems) {
      await Product.findByIdAndUpdate(
        item.productId || item.product,
        { $inc: { countInStock: -item.quantity } }
      );
    }

    // Populate for notifications
    const populatedOrder = await Order.findById(createdOrder._id)
      .populate('user', '_id firstName lastName email phone')
      .populate('orderItems.product', 'name');

    user.cartItems = []
    user.orders.push({ orderId:order._id})
    await user.save()

   try {
   await notificationService.notifyCustomerOrderPlaced(
    populatedOrder.user,
    populatedOrder
    );

  await notificationService.notifyAdminsNewOrder(
    populatedOrder,
    populatedOrder.user
  );
} catch (err) {
  console.error('Notification failure:', err);
}

    res.status(200).json({
      success: true,
      message: 'Order created successfully',
      data: {
        id: createdOrder._id,
        orderNumber: createdOrder._id.toString().slice(-8).toUpperCase(),
        totalPrice: formatPrice(createdOrder.totalPrice),
        status: createdOrder.status,
        deliveryDate: formatDate(createdOrder.createdAt), // or use preferred day
        wasGuestCheckout: createdOrder.wasGuestCheckout
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error creating order',
      error: error.message
    });
  }
});


const getOrderById = asyncHandler(async (req, res) => {
  try {
    console.log(req.params)
    const orderId = req.params.id;
    console.log(orderId)
    const userId = req.user.id;

    const order = await Order.findById(orderId)
      .populate('user', 'name email phone')
      .populate('orderItems.product', 'name category unit image');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user is authorized (owner or admin)
    if (order.user._id.toString() !== userId ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this order'
      });
    }

    // Calculate timeline
    const timeline = [
      {
        status: 'Order Placed',
        date: order.createdAt,
        completed: true,
        description: 'Order received and confirmed'
      },
      {
        status: 'Payment',
        date: order.isPaid ? order.paidAt : null,
        completed: order.isPaid,
        description: order.isPaid ? `Paid via ${order.paymentMethod}` : 'Awaiting payment'
      },
      {
        status: 'Processing',
        date: order.status === 'Processing' ? new Date() : null,
        completed: ['Processing', 'Out for Delivery', 'Delivered'].includes(order.status),
        description: 'Preparing your items'
      },
      {
        status: 'Out for Delivery',
        date: order.status === 'Out for Delivery' ? new Date() : null,
        completed: ['Out for Delivery', 'Delivered'].includes(order.status),
        description: 'On the way to your address'
      },
      {
        status: 'Delivered',
        date: order.deliveredAt,
        completed: order.isDelivered,
        description: order.isDelivered ? 'Delivered successfully' : 'Expected delivery'
      }
    ];

    res.status(200).json({
      success: true,
      data: {
        id: order._id,
        orderNumber: order._id.toString().slice(-8).toUpperCase(),
        user: {
          id: order.user._id,
          name: order.user.name,
          email: order.user.email,
          phone: order.user.phone
        },
        orderItems: order.orderItems.map(item => ({
          id: item.product?._id || item.product,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          image: item.image,
          price: formatPrice(item.price),
          totalPrice: formatPrice(item.price * item.quantity),
          product: item.product?._id ? {
            id: item.product._id,
            name: item.product.name,
            category: item.product.category,
            unit: item.product.unit,
            image: item.product.image
          } : null
        })),
        shippingAddress: order.shippingAddress,
        pricing: {
          itemsPrice: order.itemsPrice,
          itemsPriceDisplay: formatPrice(order.itemsPrice),
          deliveryFee: order.deliveryFee,
          deliveryFeeDisplay: formatPrice(order.deliveryFee),
          totalPrice: order.totalPrice,
          totalPriceDisplay: formatPrice(order.totalPrice)
        },
        payment: {
          method: order.paymentMethod,
          isPaid: order.isPaid,
          paidAt: order.paidAt,
          paidAtDisplay: formatDate(order.paidAt)
        },
        delivery: {
          date: order.deliveryDate,
          dateDisplay: formatDate(order.deliveryDate),
          isDelivered: order.isDelivered,
          deliveredAt: order.deliveredAt,
          deliveredAtDisplay: formatDate(order.deliveredAt),
          note: order.deliveryNote
        },
        status: {
          current: order.status,
          isPaid: order.isPaid,
          isDelivered: order.isDelivered,
          timeline
        },
        dates: {
          createdAt: order.createdAt,
          createdAtDisplay: formatDate(order.createdAt),
          updatedAt: order.updatedAt,
          updatedAtDisplay: formatDate(order.updatedAt)
        },
        subscriptionId: order.subscriptionId
      }
    });
  } catch (error) {
    console.log(error)
    res.status(500).json({
      success: false,
      message: 'Error fetching order',
      error: error.message
    });
  }
});


const adminGetOrderById = asyncHandler(async (req, res) => {
  try {
    console.log(req.params)
    const orderId = req.params.id;
    console.log(orderId)
    

    const order = await Order.findById(orderId)
      .populate('user', 'firstName email phone')
      .populate('orderItems.product', 'name category unit image');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    
    const timeline = [
      {
        status: 'Order Placed',
        date: order.createdAt,
        completed: true,
        description: 'Order received and confirmed'
      },
      {
        status: 'Payment',
        date: order.isPaid ? order.paidAt : null,
        completed: order.isPaid,
        description: order.isPaid ? `Paid via ${order.paymentMethod}` : 'Awaiting payment'
      },
      {
        status: 'Processing',
        date: order.status === 'Processing' ? new Date() : null,
        completed: ['Processing', 'Out for Delivery', 'Delivered'].includes(order.status),
        description: 'Preparing your items'
      },
      {
        status: 'Out for Delivery',
        date: order.status === 'Out for Delivery' ? new Date() : null,
        completed: ['Out for Delivery', 'Delivered'].includes(order.status),
        description: 'On the way to your address'
      },
      {
        status: 'Delivered',
        date: order.deliveredAt,
        completed: order.isDelivered,
        description: order.isDelivered ? 'Delivered successfully' : 'Expected delivery'
      }
    ];

    res.status(200).json({
      success: true,
      data: {
        id: order._id,
        orderNumber: order._id.toString().slice(-8).toUpperCase(),
        user: {
          id: order.user._id,
          name: order.user.firstName,
          email: order.user.email,
          phone: order.user.phone
        },
        orderItems: order.orderItems.map(item => ({
          id: item.product?._id || item.product,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          image: item.image,
          price: formatPrice(item.price),
          totalPrice: formatPrice(item.price * item.quantity),
          product: item.product?._id ? {
            id: item.product._id,
            name: item.product.name,
            category: item.product.category,
            unit: item.product.unit,
            image: item.product.image
          } : null
        })),
        shippingAddress: order.shippingAddress,
        pricing: {
          itemsPrice: order.itemsPrice,
          itemsPriceDisplay: formatPrice(order.itemsPrice),
          deliveryFee: order.deliveryFee,
          deliveryFeeDisplay: formatPrice(order.deliveryFee),
          totalPrice: order.totalPrice,
          totalPriceDisplay: formatPrice(order.totalPrice)
        },
        payment: {
          method: order.paymentMethod,
          isPaid: order.isPaid,
          paidAt: order.paidAt,
          paidAtDisplay: formatDate(order.paidAt)
        },
        delivery: {
          date: order.deliveryDate,
          dateDisplay: formatDate(order.deliveryDate),
          isDelivered: order.isDelivered,
          deliveredAt: order.deliveredAt,
          deliveredAtDisplay: formatDate(order.deliveredAt),
          note: order.deliveryNote
        },
        status: {
          current: order.status,
          isPaid: order.isPaid,
          isDelivered: order.isDelivered,
          timeline
        },
        dates: {
          createdAt: order.createdAt,
          createdAtDisplay: formatDate(order.createdAt),
          updatedAt: order.updatedAt,
          updatedAtDisplay: formatDate(order.updatedAt)
        },
        subscriptionId: order.subscriptionId
      }
    });
  } catch (error) {
    console.log(error)
    res.status(500).json({
      success: false,
      message: 'Error fetching order',
      error: error.message
    });
  }
});


const getMyOrders = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 10, sort = '-createdAt' } = req.query;

    // Build query
    const query = { user: userId };
    if (status && status !== 'all') {
      query.status = status;
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sorting
    let sortOption = {};
    if (sort === 'oldest') {
      sortOption = { createdAt: 1 };
    } else if (sort === 'price') {
      sortOption = { totalPrice: 1 };
    } else if (sort === 'price-desc') {
      sortOption = { totalPrice: -1 };
    } else {
      sortOption = { createdAt: -1 }; // newest
    }

    // Execute query
    const [orders, total] = await Promise.all([
      Order.find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .select('orderItems totalPrice status isPaid isDelivered createdAt deliveryDate'),
      Order.countDocuments(query)
    ]);

    // Calculate statistics
    const allOrders = await Order.find({ user: userId });
    const stats = {
      totalOrders: allOrders.length,
      totalSpent: allOrders.reduce((sum, order) => sum + order.totalPrice, 0),
      pendingOrders: allOrders.filter(o => o.status === 'Pending').length,
      deliveredOrders: allOrders.filter(o => o.isDelivered).length,
      avgOrderValue: allOrders.length > 0 ? 
        allOrders.reduce((sum, order) => sum + order.totalPrice, 0) / allOrders.length : 0
    };

    res.status(200).json({
      success: true,
      count: orders.length,
      total,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        limit: limitNum,
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPrevPage: pageNum > 1
      },
      stats: {
        ...stats,
        totalSpentDisplay: formatPrice(stats.totalSpent),
        avgOrderValueDisplay: formatPrice(stats.avgOrderValue)
      },
      filters: {
        status: status || 'all',
        sort,
        page: pageNum,
        limit: limitNum
      },
      data: orders.map(order => ({
        id: order._id,
        orderNumber: order._id.toString().slice(-8).toUpperCase(),
        itemsCount: order.orderItems.length,
        totalPrice: formatPrice(order.totalPrice),
        status: order.status,
        isPaid: order.isPaid,
        isDelivered: order.isDelivered,
        deliveryDate: formatDate(order.deliveryDate),
        createdAt: formatDate(order.createdAt),
        items: order.orderItems.slice(0, 3).map(item => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          image: item.image
        })),
        hasMoreItems: order.orderItems.length > 3
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching user orders',
      error: error.message
    });
  }
});


const getAllOrders = asyncHandler(async (req, res) => {
  try {
    const {
      status,
      startDate,
      endDate,
      paymentMethod,
      search,
      page = 1,
      limit = 20,
      sort = '-createdAt'
    } = req.query;

    // Build query
    const query = {};

    // Status filter
    if (status && status !== 'all') {
      query.status = status;
    }

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    // Payment method filter
    if (paymentMethod && paymentMethod !== 'all') {
      query.paymentMethod = paymentMethod;
    }

    // Search by order ID or customer name/phone
    if (search) {
      // Check if search is an order ID
      if (mongoose.Types.ObjectId.isValid(search)) {
        query._id = search;
      } else {
        // Search by customer name or phone via user reference
        const users = await User.find({
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } }
          ]
        }).select('_id');
        
        const userIds = users.map(user => user._id);
        query.user = { $in: userIds };
      }
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sorting
    let sortOption = {};
    switch (sort) {
      case 'oldest':
        sortOption = { createdAt: 1 };
        break;
      case 'totalPrice':
        sortOption = { totalPrice: 1 };
        break;
      case 'totalPrice-desc':
        sortOption = { totalPrice: -1 };
        break;
      case 'deliveryDate':
        sortOption = { deliveryDate: 1 };
        break;
      default:
        sortOption = { createdAt: -1 }; // newest
    }

    // Execute query with population
    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('user', 'name phone email')
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum),
      Order.countDocuments(query)
    ]);

    // Calculate admin statistics
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [todayOrders, pendingOrders, totalRevenue, avgOrderValue] = await Promise.all([
      Order.countDocuments({
        createdAt: { $gte: today, $lt: tomorrow }
      }),
      Order.countDocuments({ status: 'Pending' }),
      Order.aggregate([
        { $match: { isPaid: true } },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } }
      ]),
      Order.aggregate([
        { $group: { _id: null, avg: { $avg: '$totalPrice' } } }
      ])
    ]);

    res.status(200).json({
      success: true,
      count: orders.length,
      total,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        limit: limitNum,
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPrevPage: pageNum > 1
      },
      stats: {
        todayOrders,
        pendingOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        totalRevenueDisplay: formatPrice(totalRevenue[0]?.total || 0),
        avgOrderValue: avgOrderValue[0]?.avg || 0,
        avgOrderValueDisplay: formatPrice(avgOrderValue[0]?.avg || 0),
        totalOrders: total
      },
      filters: {
        status: status || 'all',
        startDate: startDate || null,
        endDate: endDate || null,
        paymentMethod: paymentMethod || 'all',
        search: search || '',
        sort,
        page: pageNum,
        limit: limitNum
      },
      data: orders.map(order => ({
        id: order._id,
        orderNumber: order._id.toString().slice(-8).toUpperCase(),
        customer: {
          id: order.user?._id,
          name: order.user?.name || 'N/A',
          phone: order.user?.phone || 'N/A'
        },
        itemsCount: order.orderItems.length,
        totalPrice: formatPrice(order.totalPrice),
        status: order.status,
        isPaid: order.isPaid,
        isDelivered: order.isDelivered,
        paymentMethod: order.paymentMethod,
        deliveryDate: formatDate(order.deliveryDate),
        createdAt: formatDate(order.createdAt),
        shippingAddress: {
          city: order.shippingAddress.city,
          address: order.shippingAddress.address.substring(0, 30) + '...'
        }
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching orders',
      error: error.message
    });
  }
});


const updateOrderToPaid = asyncHandler(async (req, res) => {
  try {
    const orderId = req.params.id;
    const { paymentDetails } = req.body;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID format'
      });
    }

    const order = await Order.findById(orderId)
      .populate('user', 'name phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.isPaid) {
      return res.status(400).json({
        success: false,
        message: 'Order is already paid'
      });
    }

    order.isPaid = true;
    order.paidAt = Date.now();
    order.status = 'Processing';
    
    if (paymentDetails) {
      order.paymentDetails = paymentDetails;
    }

    const updatedOrder = await order.save();

    // Send payment confirmation
    try {
      await sendPaymentConfirmation(updatedOrder);
    } catch (notificationError) {
      console.error('Payment confirmation failed:', notificationError);
    }

    res.status(200).json({
      success: true,
      message: 'Order marked as paid',
      data: {
        id: updatedOrder._id,
        isPaid: updatedOrder.isPaid,
        paidAt: formatDate(updatedOrder.paidAt),
        status: updatedOrder.status
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating order payment',
      error: error.message
    });
  }
});


const updateOrderToDelivered = asyncHandler(async (req, res) => {
  try {
    const orderId = req.params.id;
    const { deliveryNotes, deliveredBy } = req.body;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID format'
      });
    }

    const order = await Order.findById(orderId)
      .populate('user', 'name phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.isDelivered) {
      return res.status(400).json({
        success: false,
        message: 'Order is already delivered'
      });
    }

    order.isDelivered = true;
    order.deliveredAt = Date.now();
    order.status = 'Delivered';
    //order.deliveryNotes = deliveryNotes || order.deliveryNotes;
    //order.deliveredBy = deliveredBy;

    const updatedOrder = await order.save();

    // Send delivery confirmation
    try {
      await sendDeliveryConfirmation(updatedOrder);
    } catch (notificationError) {
      console.error('Delivery confirmation failed:', notificationError);
    }

    res.status(200).json({
      success: true,
      message: 'Order marked as delivered',
      data: {
        id: updatedOrder._id,
        isDelivered: updatedOrder.isDelivered,
        deliveredAt: formatDate(updatedOrder.deliveredAt),
        status: updatedOrder.status,
        deliveryNotes: updatedOrder.deliveryNotes,
        deliveredBy: updatedOrder.deliveredBy
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating order delivery',
      error: error.message
    });
  }
});


const updateOrderStatus = asyncHandler(async (req, res) => {
  try {
    const orderId = req.params.id;
    const { status, notes } = req.body;
    const notificationService = req.app.get("notificationService");

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID format'
      });
    }

    const validStatuses = ['Pending', 'Processing', 'Out for Delivery', 'Delivered', 'Cancelled'];
   /* if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status',
        validStatuses
      });
    }*/

    const order = await Order.findById(orderId)
      .populate('user', '_id firstName phone ');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Store old status for logging
    const oldStatus = order.status;
    order.status = status;
    
    // Update related fields based on status
    if (status === 'Delivered') {
      order.isDelivered = true;
      order.deliveredAt = Date.now();
    } else if (status === 'Cancelled') {
      // Restore product stock if cancelled
      await restoreProductStock(order.orderItems);
    }

    // Add status history
    if (!order.statusHistory) {
      order.statusHistory = [];
    }
    
    order.statusHistory.push({
      status,
      changedAt: Date.now(),
      changedBy: req.user?.id || 'system',
      notes: notes || `Status changed from ${oldStatus} to ${status}`
    });

    const updatedOrder = await order.save();

   
    try {
      await notifyCustomerOrderStatusUpdated(updatedOrder, oldStatus);
    } catch (notificationError) {
      console.error('Status notification failed:', notificationError);
    }

    res.status(200).json({
      success: true,
      message: `Order status updated to ${status}`,
      data: {
        id: updatedOrder._id,
        status: updatedOrder.status,
        oldStatus,
        isDelivered: updatedOrder.isDelivered,
        deliveredAt: formatDate(updatedOrder.deliveredAt),
        updatedAt: formatDate(updatedOrder.updatedAt)
      }
    });
  } catch (error) {
    console.log(error)
    res.status(500).json({
      success: false,
      message: 'Error updating order status',
      error: error.message
    });
  }
});


const cancelOrder = asyncHandler(async (req, res) => {
  try {
    const {orderId} = req.params;
    const userId = req.user.id;
    const { reason } = req.body;
    const notificationService = req.app.get("notificationService");

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID format'
      });
    }

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user is authorized
    if (order.user.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this order'
      });
    }

    // Check if order can be cancelled
    if (!['Pending', 'Processing'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel order with status: ${order.status}`
      });
    }

    // Check if order is already paid and policy allows cancellation
    if (order.isPaid) {
      // You might want to implement refund logic here
      return res.status(400).json({
        success: false,
        message: 'Paid orders cannot be cancelled. Please contact support.'
      });
    }

    // Update order
    order.status = 'Cancelled';
    order.cancelledAt = Date.now();
    order.cancellationReason = reason;
    order.cancelledBy = userId;

    // Restore product stock
    await restoreProductStock(order.orderItems);

    await order.save();

    // Send cancellation notification
    try {
      await notificationService.sendCancellationNotification(order, reason);
    } catch (notificationError) {
      console.error('Cancellation notification failed:', notificationError);
    }

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      data: {
        id: order._id,
        status: order.status,
        cancelledAt: formatDate(order.cancelledAt),
        cancellationReason: reason
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error cancelling order',
      error: error.message
    });
  }
});

// @desc    Get order analytics (Admin)
// @route   GET /api/orders/analytics/overview
// @access  Private/Admin
const getOrderAnalytics = asyncHandler(async (req, res) => {
  try {
    const { period = 'month' } = req.query; // day, week, month, year
    
    const now = new Date();
    let startDate;
    
    switch (period) {
      case 'day':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // Get total counts
    const [
      totalOrders,
      pendingOrders,
      deliveredOrders,
      totalRevenue,
      avgOrderValue,
      popularProducts
    ] = await Promise.all([
      Order.countDocuments({ createdAt: { $gte: startDate } }),
      Order.countDocuments({ 
        createdAt: { $gte: startDate },
        status: 'Pending'
      }),
      Order.countDocuments({ 
        createdAt: { $gte: startDate },
        status: 'Delivered'
      }),
      Order.aggregate([
        { 
          $match: { 
            createdAt: { $gte: startDate },
            isPaid: true 
          } 
        },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } }
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: null, avg: { $avg: '$totalPrice' } } }
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $unwind: '$orderItems' },
        { 
          $group: { 
            _id: '$orderItems.product',
            name: { $first: '$orderItems.name' },
            totalQuantity: { $sum: '$orderItems.quantity' },
            totalRevenue: { 
              $sum: { $multiply: ['$orderItems.price', '$orderItems.quantity'] } 
            }
          } 
        },
        { $sort: { totalQuantity: -1 } },
        { $limit: 10 }
      ])
    ]);

    // Get daily/weekly/monthly trends
    const trendData = await getOrderTrends(period, startDate);

    res.status(200).json({
      success: true,
      period,
      dateRange: {
        start: startDate,
        end: now
      },
      stats: {
        totalOrders,
        pendingOrders,
        deliveredOrders,
        cancelledOrders: totalOrders - deliveredOrders - pendingOrders,
        deliveryRate: totalOrders > 0 ? (deliveredOrders / totalOrders * 100).toFixed(1) : 0,
        totalRevenue: totalRevenue[0]?.total || 0,
        totalRevenueDisplay: formatPrice(totalRevenue[0]?.total || 0),
        avgOrderValue: avgOrderValue[0]?.avg || 0,
        avgOrderValueDisplay: formatPrice(avgOrderValue[0]?.avg || 0),
        avgOrdersPerDay: totalOrders / Math.max(1, (now - startDate) / (1000 * 60 * 60 * 24))
      },
      popularProducts: popularProducts.map(product => ({
        productId: product._id,
        name: product.name,
        totalQuantity: product.totalQuantity,
        totalRevenue: product.totalRevenue,
        totalRevenueDisplay: formatPrice(product.totalRevenue)
      })),
      trends: trendData,
      lastUpdated: new Date()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching order analytics',
      error: error.message
    });
  }
});

// Helper Functions

// Calculate delivery fee based on location and order value
const calculateDeliveryFee = (itemsPrice, city) => {
  // Base delivery fee
  let fee = 0;
  
  // Free delivery for orders above certain amount
  if (itemsPrice > 100) {
    return 0;
  }
  
  // Different fees based on city/zone
  const cityFees = {
    'accra': 5,
    'kumasi': 7,
    'tema': 6,
    'takoradi': 8,
    'default': 10
  };
  
  fee = cityFees[city.toLowerCase()] || cityFees.default;
  
  // Minimum order fee
  if (itemsPrice < 50) {
    fee += 2;
  }
  
  return fee;
};

// Restore product stock when order is cancelled
const restoreProductStock = async (orderItems) => {
  for (const item of orderItems) {
    await Product.findByIdAndUpdate(
      item.product,
      { $inc: { countInStock: item.quantity } }
    );
  }
};

// Get order trends for analytics
const getOrderTrends = async (period, startDate) => {
  const now = new Date();
  let groupFormat;
  
  switch (period) {
    case 'day':
      groupFormat = { hour: { $hour: '$createdAt' } };
      break;
    case 'week':
      groupFormat = { day: { $dayOfMonth: '$createdAt' } };
      break;
    case 'month':
      groupFormat = { day: { $dayOfMonth: '$createdAt' } };
      break;
    case 'year':
      groupFormat = { month: { $month: '$createdAt' } };
      break;
    default:
      groupFormat = { day: { $dayOfMonth: '$createdAt' } };
  }

  const trends = await Order.aggregate([
    { $match: { createdAt: { $gte: startDate, $lte: now } } },
    {
      $group: {
        _id: groupFormat,
        count: { $sum: 1 },
        revenue: { $sum: '$totalPrice' },
        avgValue: { $avg: '$totalPrice' }
      }
    },
    { $sort: { '_id': 1 } }
  ]);

  return trends;
};

// WhatsApp notification functions (implement based on your WhatsApp Business API)
const sendWhatsAppNotification = async (order) => {
  if (!WHATSAPP_API_URL || !WHATSAPP_TOKEN) {
    return; // WhatsApp not configured
  }

  const message = generateOrderSummary(order);
  const adminPhone = process.env.ADMIN_PHONE_NUMBER;

  try {
    await axios.post(
      `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: adminPhone,
        type: "text",
        text: { body: message }
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (error) {
    console.error('WhatsApp API Error:', error.response?.data || error.message);
    throw error;
  }
};

// Other notification functions (to be implemented)
const sendCustomerConfirmation = async (order) => {
  // Implement email/SMS confirmation
  console.log('Customer confirmation sent for order:', order._id);
};

const sendPaymentConfirmation = async (order) => {
  // Implement payment confirmation
  console.log('Payment confirmation sent for order:', order._id);
};

const sendDeliveryConfirmation = async (order) => {
  // Implement delivery confirmation
  console.log('Delivery confirmation sent for order:', order._id);
};

const sendStatusUpdateNotification = async (order, oldStatus) => {
  // Implement status update notification
  console.log(`Status update from ${oldStatus} to ${order.status} sent for order:`, order._id);
};

const sendCancellationNotification = async (order, reason) => {
  // Implement cancellation notification
  console.log('Cancellation notification sent for order:', order._id, 'Reason:', reason);
};

module.exports = {
  createOrder,
  getOrderById,
  adminGetOrderById,
  getMyOrders,
  getAllOrders,
  updateOrderToPaid,
  updateOrderToDelivered,
  updateOrderStatus,
  cancelOrder,
  getOrderAnalytics
};
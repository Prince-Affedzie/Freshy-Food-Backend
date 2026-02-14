const express = require('express');
const orderrouter = express.Router();
const {
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
} = require('../controllers/orderController');
const {auth} = require('../middleware/auth');
//const { protect, admin } = require('../middleware/authMiddleware');

// Public routes - None, all orders require authentication

// User routes
orderrouter.post('/order', auth, createOrder);
orderrouter.get('/myorders',auth, getMyOrders);
orderrouter.get('/order/:id', auth, getOrderById);
orderrouter.put('/order/:orderId/cancel', auth, cancelOrder);

// Admin routes
orderrouter.get('/orders', getAllOrders);
orderrouter.put('/update-order/:id/pay', updateOrderToPaid);
orderrouter.get('/admin/order/:id', adminGetOrderById);
orderrouter.put('/:id/deliver',updateOrderToDelivered);
orderrouter.put('/update-order/:id/status', updateOrderStatus);
orderrouter.get('/orders/analytics/overview',  getOrderAnalytics);

module.exports = orderrouter;
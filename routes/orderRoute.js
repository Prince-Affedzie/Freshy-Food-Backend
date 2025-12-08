const express = require('express');
const orderrouter = express.Router();
const {
  createOrder,
  getOrderById,
  getMyOrders,
  getAllOrders,
  updateOrderToPaid,
  updateOrderToDelivered,
  updateOrderStatus,
  cancelOrder,
  getOrderAnalytics
} = require('../controllers/orderController');
//const { protect, admin } = require('../middleware/authMiddleware');

// Public routes - None, all orders require authentication

// User routes
orderrouter.post('/order',  createOrder);
orderrouter.get('/myorders', getMyOrders);
orderrouter.get('order/:id',  getOrderById);
orderrouter.put('order/:id/cancel',  cancelOrder);

// Admin routes
orderrouter.get('/orders', getAllOrders);
orderrouter.put('/update-order/:id/pay', updateOrderToPaid);
orderrouter.put('/:id/deliver',updateOrderToDelivered);
orderrouter.put('/update-order/:id/status', updateOrderStatus);
orderrouter.get('/orders/analytics/overview',  getOrderAnalytics);

module.exports = orderrouter;
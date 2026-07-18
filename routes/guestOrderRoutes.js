// src/routes/guestOrderRoutes.js
const express = require('express');
const guestOrderRouter = express.Router();
const {
  createGuestOrder,
  getGuestOrderById,
  getGuestOrdersByPhone,
  getVendorGuestOrders,
  updateGuestOrderStatus,
  cancelGuestOrder,
  getGuestOrderStats
} = require('../controllers/guestOrderController');

// Public routes (no auth required)
guestOrderRouter.post('/guest_order', createGuestOrder);
guestOrderRouter.get('/guest_order/phone/:phone', getGuestOrdersByPhone);
guestOrderRouter.get('/guest_order/:orderId', getGuestOrderById);
guestOrderRouter.put('/guest_order/:orderId/cancel', cancelGuestOrder);

// Vendor routes (should add auth middleware)
guestOrderRouter.get('/guest_order/vendor/:vendorId', getVendorGuestOrders);
guestOrderRouter.put('/guest_order/:orderId/status', updateGuestOrderStatus);
guestOrderRouter.get('/guest_order/vendor/:vendorId/stats', getGuestOrderStats);

module.exports = guestOrderRouter;
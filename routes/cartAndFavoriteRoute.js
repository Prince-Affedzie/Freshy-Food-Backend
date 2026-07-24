const express = require('express');
const userActionRouter = express.Router();
const {auth} = require('../middleware/auth');

const {
  addToCart,
  removeFromCart,
  updateCartQuantity,
  addToFavorites,
  removeFromFavorites,
  getUserCartAndFavorites,
   clearCart,
} = require('../controllers/cartController');
const { activityLoggerMiddleware } = require('../middleware/activityLoggerMiddleware');


userActionRouter.post('/cart', auth, activityLoggerMiddleware('cart_item_added'), addToCart);
userActionRouter.put('/cart', auth, activityLoggerMiddleware('cart_item_updated'),updateCartQuantity);
userActionRouter.put('/clear_cart', auth,activityLoggerMiddleware('cart_cleared'), clearCart);
userActionRouter.delete('/cart/:productId', auth,activityLoggerMiddleware('cart_item_removed'), removeFromCart);

userActionRouter.post('/favorites/:productId', auth, addToFavorites);
userActionRouter.delete('/favorites/:productId', auth, removeFromFavorites);

userActionRouter.get('/me/cart-favorites', auth,activityLoggerMiddleware('cart_viewed'), getUserCartAndFavorites);

module.exports = userActionRouter;

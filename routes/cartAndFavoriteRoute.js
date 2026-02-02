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

userActionRouter.post('/cart', auth, addToCart);
userActionRouter.put('/cart', auth, updateCartQuantity);
userActionRouter.put('/clear_cart', auth, clearCart);
userActionRouter.delete('/cart/:productId', auth, removeFromCart);

userActionRouter.post('/favorites/:productId', auth, addToFavorites);
userActionRouter.delete('/favorites/:productId', auth, removeFromFavorites);

userActionRouter.get('/me/cart-favorites', auth, getUserCartAndFavorites);

module.exports = userActionRouter;

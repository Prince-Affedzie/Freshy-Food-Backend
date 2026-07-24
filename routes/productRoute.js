const express = require('express');
const { upload } = require('../Utils/mutlerConfig');
const productrouter = express.Router();
const { auth } = require('../middleware/auth');
const {
  getAllProducts,
  getProductById,
  getProductsByCategory,
  getProductsByCampus,
  getProductsByTag,
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
  createProductReview,
  toggleFavorite,
  getProductStats,
} = require('../controllers/productController');
const { activityLoggerMiddleware } = require('../middleware/activityLoggerMiddleware');

// Public routes
productrouter.get('/products',activityLoggerMiddleware('product_viewed'), getAllProducts);
productrouter.get('/products/category/:category', getProductsByCategory);
productrouter.get('/products/campus/:campus', getProductsByCampus);
productrouter.get('/products/tag/:tag', getProductsByTag);
productrouter.get('/products/search/:query', activityLoggerMiddleware('product_searched'), searchProducts);
productrouter.get('/products/stats', getProductStats);
productrouter.get('/product/:id',activityLoggerMiddleware('product_viewed'), getProductById);

// Protected routes (logged in users)
productrouter.post('/product/:id/review', auth, createProductReview);
productrouter.post('/product/:id/favorite', auth, toggleFavorite);

// Vendor routes
productrouter.post('/product', auth, upload.array('productImages', 10),activityLoggerMiddleware('product_created'), createProduct);
productrouter.put('/product/:id', auth, upload.array('productImages', 10), activityLoggerMiddleware('product_updated'), updateProduct);
productrouter.delete('/product/:id', auth, activityLoggerMiddleware('product_deleted'), deleteProduct);

module.exports = productrouter;
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

// Public routes
productrouter.get('/products', getAllProducts);
productrouter.get('/products/category/:category', getProductsByCategory);
productrouter.get('/products/campus/:campus', getProductsByCampus);
productrouter.get('/products/tag/:tag', getProductsByTag);
productrouter.get('/products/search/:query', searchProducts);
productrouter.get('/products/stats', getProductStats);
productrouter.get('/product/:id', getProductById);

// Protected routes (logged in users)
productrouter.post('/product/:id/review', auth, createProductReview);
productrouter.post('/product/:id/favorite', auth, toggleFavorite);

// Vendor routes
productrouter.post('/product', auth, upload.array('productImages', 10), createProduct);
productrouter.put('/product/:id', auth, upload.array('productImages', 10), updateProduct);
productrouter.delete('/product/:id', auth, deleteProduct);

module.exports = productrouter;
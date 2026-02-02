const express = require('express');
const {upload} = require('../Utils/mutlerConfig')
const productrouter = express.Router();
const {
  getAllProducts,
  getProductById,
  getProductsByCategory,
  createProduct,
  updateProduct,
  deleteProduct,
  updateProductStock,
  bulkUpdateAvailability,
  searchProducts,
  getProductStats,
  getSeasonalProducts
} = require('../controllers/productController');
//const { protect, admin } = require('../middleware/authMiddleware');

// Public routes
productrouter.get('/products', getAllProducts);
productrouter.get('/products/category/:category', getProductsByCategory);
productrouter.get('/products/search/:query', searchProducts);
productrouter.get('/products/seasonal/current', getSeasonalProducts);
productrouter.get('/product/:identifier', getProductById);

// Admin routes
productrouter.post('/product-add',upload.single('productImage'),createProduct);
productrouter.put('/product-update/:id',upload.single('productImage'), updateProduct);
productrouter.delete('/product-delete/:id', deleteProduct);
productrouter.patch('/product/:id/stock', updateProductStock);
productrouter.patch('/products/bulk/availability', bulkUpdateAvailability);
productrouter.get('/products/stats/overview',  getProductStats);

module.exports = productrouter;
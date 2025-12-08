const express = require('express');
const packagerouter = express.Router();
const {
  getAllPackages,
  getPackageById,
  createPackage,
  updatePackage,
  deletePackage,
  togglePackageStatus,
  getPackagesByCategory,
  getSwapOptionsForItem,
  validateCustomization,
  getPackageAnalytics
} = require('../controllers/packageController');
const {upload} = require('../Utils/mutlerConfig')

//const { protect, admin } = require('../middleware/authMiddleware');

// Public routes
packagerouter.get('/packages', getAllPackages);
packagerouter.get('/category/:category', getPackagesByCategory);
packagerouter.get('/package/:id', getPackageById);
packagerouter.get('/:packageId/swaps/:productId', getSwapOptionsForItem);
packagerouter.post('/:id/validate-customization', validateCustomization);

// Admin routes
packagerouter.post('/package',upload.single('packageImage'), createPackage);
packagerouter.put('/update-package/:id',upload.single('packageImage'), updatePackage);
packagerouter.delete('/delete-package/:id',deletePackage);
packagerouter.patch('/package/:id/toggle-status', togglePackageStatus);
packagerouter.get('/analytics/overview', getPackageAnalytics);

module.exports = packagerouter;
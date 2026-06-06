const express = require('express');
const vendorRouter = express.Router();
const {
  createVendor,
  getVendors,
  getVendor,
  updateVendor,
  deleteVendor,
  getVendorsByMarket,
  getVendorProducts,
  getMyVendorProfile,
  updateMyVendorProfile,
  getVendorOrders,
} = require('../controllers/vendorController');
const {upload} = require('../Utils/mutlerConfig')
const {auth} = require('../middleware/auth');



vendorRouter.post('/vendor',upload.fields([
  { name: 'storeBanner', maxCount: 1 },
  { name: 'profileImage', maxCount: 1 }
]),createVendor)

vendorRouter.get('/vendor',getVendors)
vendorRouter.get('/vendors/by_market',getVendorsByMarket)
vendorRouter.get('/vendor/my_products',auth, getVendorProducts)
  


vendorRouter.get('/vendor/:id',getVendor)
vendorRouter.put('/vendor/:id',upload.fields([
  { name: 'storeBanner', maxCount: 1 },
  { name: 'profileImage', maxCount: 1 }
]),updateVendor)
vendorRouter.delete('/vendor/:id',deleteVendor)

vendorRouter.get('/vendor_profile',auth,getMyVendorProfile)

vendorRouter.put('/vendor_update_profile',auth,upload.fields([
  { name: 'storeBanner', maxCount: 1 },
  { name: 'profileImage', maxCount: 1 }
]),updateMyVendorProfile)

vendorRouter.get('/vendor_my_orders',auth,getVendorOrders)

module.exports = vendorRouter;
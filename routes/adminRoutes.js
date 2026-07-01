const {getAllUsers,
  getUserById,
  createUser,
  updateUser,
  toggleAdmin,
  deleteUser} = require("../controllers/adminUserController")
  const { getAdminDashboardData,getProductById,notifyUsersByRole,
    broadcastNotification,
    deleteProduct,updateProduct,getVendors,getVendor,updateVendor,deleteVendor
  } = require('../controllers/adminMainController')
  const {getPaymentOverview,
  getAllPayments,
  getPaymentById,
  updatePaymentStatus,
  refundPayment,} = require('../controllers/adminPaymentController')
  const {upload} = require('../Utils/mutlerConfig')


  const express = require('express')
  const adminRoutes = express.Router()

  //router.use(protect, adminOnly);
adminRoutes.get('/admin/dashboard', getAdminDashboardData,)
adminRoutes.get('/admin/users', getAllUsers);
adminRoutes.get('/admin/users/:id', getUserById);
adminRoutes.post('/admin/users', createUser);
adminRoutes.put('/admin/users/:id', updateUser);
adminRoutes.patch('/admin/users/:id/toggle-admin', toggleAdmin);
adminRoutes.delete('/admin/users/:id', deleteUser);


adminRoutes.get('/admin/payments/overview',  getPaymentOverview);
adminRoutes.get('/admin/payments',  getAllPayments);
adminRoutes.get('/admin/payments/:id',  getPaymentById);
adminRoutes.put('/admin/payments/:id/status',  updatePaymentStatus);
adminRoutes.post('/admin/payments/:id/refund',  refundPayment);

// productsRoutes
adminRoutes.get('/admin/product/:id', getProductById);
adminRoutes.delete('/admin/product/:id', deleteProduct);
adminRoutes.put('/admin/product/:id',upload.array('productImages', 10), updateProduct);

// vendorRoutes
adminRoutes.get('/admin/vendors',getVendors)
adminRoutes.get('/admin/vendor/:id',getVendor)
adminRoutes.put('/admin/vendor/:id',upload.fields([
  { name: 'storeBanner', maxCount: 1 },
  { name: 'profileImage', maxCount: 1 }
]),updateVendor)

adminRoutes.delete('/admin/vendor/:id',deleteVendor)

// notification Routes
adminRoutes.post('/admin/notifications/role',notifyUsersByRole);

adminRoutes.post('/admin/notifications/broadcast',broadcastNotification);




module.exports = adminRoutes;

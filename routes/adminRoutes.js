const {getAllUsers,
  getUserById,
  createUser,
  updateUser,
  toggleAdmin,
  deleteUser} = require("../controllers/adminUserController")
  const { getAdminDashboardData,} = require('../controllers/adminMainController')
  const {getPaymentOverview,
  getAllPayments,
  getPaymentById,
  updatePaymentStatus,
  refundPayment,} = require('../controllers/adminPaymentController')

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


module.exports = adminRoutes;

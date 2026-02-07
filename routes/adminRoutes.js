const {getAllUsers,
  getUserById,
  createUser,
  updateUser,
  toggleAdmin,
  deleteUser} = require("../controllers/adminUserController")
  const express = require('express')
  const adminRoutes = express.Router()

  //router.use(protect, adminOnly);

adminRoutes.get('/admin/users', getAllUsers);
adminRoutes.get('/admin/users/:id', getUserById);
adminRoutes.post('/admin/users', createUser);
adminRoutes.put('/admin/users/:id', updateUser);
adminRoutes.patch('/admin/users/:id/toggle-admin', toggleAdmin);
adminRoutes.delete('/admin/users/:id', deleteUser);

module.exports = adminRoutes;

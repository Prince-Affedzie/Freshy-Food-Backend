const User = require('../model/User')
/**
 * GET /admin/users
 */
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password -pushToken')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
};

/**
 * GET /admin/users/:id
 */
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Invalid user ID'
    });
  }
};

/**
 * POST /admin/users
 */
const createUser = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      role,
      isAdmin
    } = req.body;

    const exists = await User.findOne({
      $or: [{ email }, { phone }]
    });

    if (exists) {
      return res.status(409).json({
        success: false,
        message: 'User with email or phone already exists'
      });
    }

    const user = await User.create({
      firstName,
      lastName,
      email,
      phone,
      role: role || 'customer',
      isAdmin: isAdmin || false
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: error.message
    });
  }
};

/**
 * PUT /admin/users/:id
 */
const updateUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: error.message
    });
  }
};

/**
 * PATCH /admin/users/:id/toggle-admin
 */
const toggleAdmin = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.isAdmin = !user.isAdmin;
    await user.save();

    res.status(200).json({
      success: true,
      message: `User is now ${user.isAdmin ? 'an admin' : 'a regular user'}`,
      isAdmin: user.isAdmin
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update admin status'
    });
  }
};

/**
 * DELETE /admin/users/:id
 */
const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  toggleAdmin,
  deleteUser
};

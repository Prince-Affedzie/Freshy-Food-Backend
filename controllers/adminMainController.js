const Order = require('../model/Order');
const Product = require('../model/Product');
const { Payment } = require('../model/PaymentModel');
const User = require('../model/User');
const Vendor = require('../model/Vendor');
const asyncHandler = require('express-async-handler');
const cloudinary = require('../Utils/cloudinaryConfig')
const { 
  uploadMultipleProductImages, 
  deleteMultipleProductImages 
} = require('../config/supabaseS3');

const getAdminDashboardData = async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    /* =====================
       BASIC COUNTS
    ====================== */
    const [
      totalUsers,
      totalOrders,
      totalProducts,
      totalRevenueAgg,
    ] = await Promise.all([
      User.countDocuments(),
      Order.countDocuments(),
      Product.countDocuments(),
      Payment.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    const totalRevenue = totalRevenueAgg[0]?.total || 0;

    /* =====================
       ORDERS ANALYTICS
    ====================== */
    const ordersByStatus = await Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const todayOrders = await Order.countDocuments({
      createdAt: { $gte: todayStart, $lte: todayEnd }
    });

    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('user', 'firstName email')
      .select('totalPrice status createdAt');

    /* =====================
       PAYMENT ANALYTICS
    ====================== */
    const paymentsSummary = await Payment.aggregate([
      {
        $group: {
          _id: '$status',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const todayRevenueAgg = await Payment.aggregate([
      {
        $match: {
          status: 'paid',
          createdAt: { $gte: todayStart, $lte: todayEnd }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const todayRevenue = todayRevenueAgg[0]?.total || 0;

    /* =====================
       PRODUCT ANALYTICS
    ====================== */
    const lowStockProducts = await Product.find({
      countInStock: { $lte: 5, $gt: 0 }
    }).select('name countInStock price');

    const outOfStockProducts = await Product.find({
      countInStock: 0
    }).select('name price');

    const topSellingProducts = await Order.aggregate([
      { $unwind: '$orderItems' },
      {
        $group: {
          _id: '$orderItems.product',
          totalSold: { $sum: '$orderItems.quantity' }
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          name: '$product.name',
          totalSold: 1
        }
      }
    ]);

    /* =====================
       RESPONSE
    ====================== */
    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalUsers,
          totalOrders,
          totalProducts,
          totalRevenue,
          todayOrders,
          todayRevenue,
        },

        orders: {
          byStatus: ordersByStatus,
          recent: recentOrders,
        },

        payments: {
          summary: paymentsSummary,
        },

        products: {
          lowStock: lowStockProducts,
          outOfStock: outOfStockProducts,
          topSelling: topSellingProducts,
        },
      },
    });

  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load admin dashboard data',
    });
  }
};


const getProductById = asyncHandler(async (req, res) => {
  console.log(req.params)
  const product = await Product.findById(req.params.id)
    .populate('vendor', '_id name phone rating')
    .populate('reviews.user', 'name avatar');

  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }


  res.status(200).json({
    success: true,
    data: { product}
  });
});



const updateProduct = asyncHandler(async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    console.log(req.body)

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Regular fields (excluding 'location')
    const updatableFields = [
      'name', 'category', 'subcategory', 'brand', 'price', 'negotiable', 'condition',
      'description', 'campus', 'tags', 'countInStock', 'isAvailable'
    ];

    updatableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        product[field] = req.body[field];
      }
    });

    // Handle location separately
    if (req.body.location) {
      // If location is a string or has specific structure, handle accordingly
      if (typeof req.body.location === 'object' && !Array.isArray(req.body.location)) {
        // For nested location object (from FormData with brackets)
        if (!product.location) {
          product.location = {};
        }
        
        // Update only the fields that are provided
        if (req.body.location.campusArea !== undefined) {
          product.location.campusArea = req.body.location.campusArea;
        }
        if (req.body.location.hostel !== undefined) {
          product.location.hostel = req.body.location.hostel;
        }
      } else {
        // If location is a simple value
        product.location = req.body.location;
      }
    }

    // Also handle campus separately if it's sent directly
    if (req.body.campus !== undefined) {
      product.campus = req.body.campus;
    }


    if (req.body.name && req.body.name !== product.name) {
      let newSlug = generateSlug(req.body.name);
      const existing = await Product.findOne({ slug: newSlug, _id: { $ne: product._id } });
      if (existing) newSlug = `${newSlug}-${Date.now()}`;
      product.slug = newSlug;
    }

    // Handle images
    if (req.files && req.files.length > 0) {
      try {
        if (product.images?.length) {
          await deleteMultipleProductImages(product.images);
        }

        const result = await uploadMultipleProductImages(req.files);
        
        // Add safety check for the result
        if (result && Array.isArray(result) && result.length > 0) {
          product.images = result.map(r => r && r.url).filter(Boolean);
        } else {
          product.images = [];
        }
      } catch (uploadError) {
        return res.status(500).json({
          success: false,
          message: 'Failed to upload new images',
          error: uploadError.message
        });
      }
    }

    await product.save();

    res.status(200).json({ success: true, message: 'Product updated', data: product });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
});


// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private/Vendor (owner) or Admin
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }
  console.log('product',product)

  const vendor = await Vendor.findById( product.vendor );

  if (product.images?.length) {
    try {
      await deleteMultipleProductImages(product.images);
    } catch (err) {
      console.log("Image deletion error:", err.message);
    }
  }
 
   vendor.products.pull(product._id);
   await vendor.save();
  await product.deleteOne();
 
  res.status(200).json({ success: true, message: 'Product deleted' });
});


// Vendor functions
const getVendors = async (req, res) => {
  try {
    let query = {};
    
    
    if (req.campus) {
      query.campus = req.campus;
    }

    const vendors = await Vendor.find(query).populate('products').sort({createdAt:-1});
    res.status(200).json({ 
      success: true, 
      count: vendors.length, 
      data: vendors 
    });
  } catch (error) {
    console.log(error)
    res.status(400).json({ success: false, error: error.message });
  }
};


const getVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id).populate('products');
    
    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    res.status(200).json({ success: true, data: vendor });
  } catch (error) {
    console.log(error)
    res.status(400).json({ success: false, error: error.message });
  }
};


const updateVendor = async (req, res) => {
  try {
    const { id } = req.params;

    const vendor = await Vendor.findById(id);

    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    const uploadToCloudinary = async (fileBuffer, mimetype, folder) => {
      const b64 = Buffer.from(fileBuffer).toString('base64');
      const dataURI = `data:${mimetype};base64,${b64}`;
      return await cloudinary.uploader.upload(dataURI, {
        folder: `cedimart/${folder}`,
        resource_type: 'auto',
        transformation: [
          { width: 1000, height: 1000, crop: 'limit' },
          { quality: 'auto:good' },
        ],
      });
    };

    let updatedData = { ...req.body };

    // Remove file objects from updatedData — prevent "[object Object]" strings
    delete updatedData.storeBanner;
    delete updatedData.profileImage;
    // Also clean old field names if they come through
    delete updatedData.store_banner;
    delete updatedData.profile_image;

    // Handle Store Banner Upload
    if (req.files && req.files.storeBanner) {
      // Delete old banner if it exists
      if (vendor.storeBannerCloudinaryId) {
        await cloudinary.uploader.destroy(vendor.storeBannerCloudinaryId);
      }

      const bannerResult = await uploadToCloudinary(
        req.files.storeBanner[0].buffer,
        req.files.storeBanner[0].mimetype,
        'vendors/banners'
      );

      updatedData.storeBanner = bannerResult.secure_url;
      updatedData.storeBannerCloudinaryId = bannerResult.public_id;
    }

    // Handle Profile Image Upload
    if (req.files && req.files.profileImage) {
      // Delete old profile image if it exists
      if (vendor.profileImageCloudinaryId) {
        await cloudinary.uploader.destroy(vendor.profileImageCloudinaryId);
      }

      const profileResult = await uploadToCloudinary(
        req.files.profileImage[0].buffer,
        req.files.profileImage[0].mimetype,
        'vendors/profiles'
      );

      updatedData.profileImage = profileResult.secure_url;
      updatedData.profileImageCloudinaryId = profileResult.public_id;
    }

    // Validate campus if being updated
    if (updatedData.campus) {
      const validCampuses = ['UG', 'KNUST', 'UCC', 'UEW', 'UPSA', 'GIMPA', 'ASHESI', 'ATU', 'OTHER'];
      if (!validCampuses.includes(updatedData.campus)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid campus',
          validCampuses,
        });
      }
    }

    // Handle nested location object
    if (updatedData.campusArea !== undefined || updatedData.hostel !== undefined) {
      updatedData.location = {
        ...vendor.location,
        ...(updatedData.campusArea !== undefined && { campusArea: updatedData.campusArea }),
        ...(updatedData.hostel !== undefined && { hostel: updatedData.hostel }),
      };
      delete updatedData.campusArea;
      delete updatedData.hostel;
    }

    // Handle nested socialLinks object
    if (updatedData.whatsapp !== undefined || updatedData.instagram !== undefined) {
      updatedData.socialLinks = {
        ...vendor.socialLinks,
        ...(updatedData.whatsapp !== undefined && { whatsapp: updatedData.whatsapp }),
        ...(updatedData.instagram !== undefined && { instagram: updatedData.instagram }),
      };
      delete updatedData.whatsapp;
      delete updatedData.instagram;
    }

    // Handle categories as array
    if (updatedData.categories) {
      if (typeof updatedData.categories === 'string') {
        updatedData.categories = updatedData.categories.split(',').map(c => c.trim()).filter(Boolean);
      }
    }

    const updatedVendor = await Vendor.findByIdAndUpdate(id, updatedData, {
      new: true,
      runValidators: true,
    }).populate('user', 'firstName lastName phone role');

    res.status(200).json({
      success: true,
      message: 'Vendor updated successfully',
      data: updatedVendor,
    });
  } catch (error) {
    console.error('Update Vendor Error:', error);

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        errors,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};


const deleteVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findByIdAndDelete(req.params.id);

    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};





module.exports = {
  getAdminDashboardData,
  getProductById,
  deleteProduct,
  updateProduct,
  getVendors,
  getVendor,
  updateVendor,
  deleteVendor,
};

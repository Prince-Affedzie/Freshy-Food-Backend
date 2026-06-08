const Vendor = require('../model/Vendor');
const cloudinary = require('../Utils/cloudinaryConfig')
const User = require('../model/User')
const Product = require('../model/Product');
const mongoose = require('mongoose');
const Order = require('../model/Order');



const createVendor = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      name,
      phone,
      storeName,
      campus,
      campusArea,
      hostel,
      categories,
      bio,
      whatsapp,
      instagram,
    } = req.body;

    // Validate required fields
    if (!name || !phone) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Name and phone number are required',
      });
    }

    // Validate campus if provided
    const validCampuses = ['UG', 'KNUST', 'UCC', 'UEW', 'UPSA', 'GIMPA', 'ASHESI', 'ATU', 'OTHER'];
    if (campus && !validCampuses.includes(campus)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Invalid campus',
        validCampuses,
      });
    }

    // Check if phone already exists
    const existingUser = await User.findOne({ phone }).session(session);
    if (existingUser) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'A user with this phone number already exists',
      });
    }

    // Split the name into firstName and lastName
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Vendor';

    let storeBannerUrl = '';
    let storeBannerCloudinaryId = '';
    let profileImageUrl = '';
    let profileImageCloudinaryId = '';

    // Helper function to handle Cloudinary upload
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

    // Handle Cloudinary Uploads
    if (req.files?.storeBanner) {
      const result = await uploadToCloudinary(
        req.files.storeBanner[0].buffer,
        req.files.storeBanner[0].mimetype,
        'vendors/banners'
      );
      storeBannerUrl = result.secure_url;
      storeBannerCloudinaryId = result.public_id;
    }

    if (req.files?.profileImage) {
      const result = await uploadToCloudinary(
        req.files.profileImage[0].buffer,
        req.files.profileImage[0].mimetype,
        'vendors/profiles'
      );
      profileImageUrl = result.secure_url;
      profileImageCloudinaryId = result.public_id;
    }

    // Create the User
    const user = new User({
      firstName,
      lastName,
      phone,
      role: 'vendor',
    });
    await user.save({ session });

    // Parse categories if sent as string
    let parsedCategories = [];
    if (categories) {
      parsedCategories = Array.isArray(categories)
        ? categories
        : categories.split(',').map(c => c.trim()).filter(Boolean);
    }

    // Build vendor data
    const vendorData = {
      user: user._id,
      name,
      storeName: storeName || name,
      phone,
      campus: campus || undefined,
      location: {
        campusArea: campusArea || '',
        hostel: hostel || '',
      },
      categories: parsedCategories.length > 0 ? parsedCategories : undefined,
      bio: bio || '',
      socialLinks: {
        whatsapp: whatsapp || '',
        instagram: instagram || '',
      },
      storeBanner: storeBannerUrl || 'default_banner.jpg',
      storeBannerCloudinaryId: storeBannerCloudinaryId || '',
      profileImage: profileImageUrl || 'default_profile.jpg',
      profileImageCloudinaryId: profileImageCloudinaryId || '',
    };

    const vendor = await Vendor.create([vendorData], { session });

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      success: true,
      message: 'Vendor account created successfully',
      data: {
        vendor: vendor[0],
        user: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          role: user.role,
        },
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({
        success: false,
        message: `A vendor with this ${field} already exists`,
        error: error.message,
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors,
      });
    }

    console.error('Vendor/User Creation Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create vendor account',
      error: error.message,
    });
  }
};

const getVendors = async (req, res) => {
  try {
    let query = {};
    
    
    if (req.query.market) {
      query.market_name = req.query.market;
    }

    const vendors = await Vendor.find(query).populate('products');
    res.status(200).json({ 
      success: true, 
      count: vendors.length, 
      data: vendors 
    });
  } catch (error) {
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


const getVendorsByMarket = async (req, res) => {
  try {
    const groupedVendors = await Vendor.aggregate([
      {
        $group: {
          _id: "$market_name", // Group by the market name
          vendors: { 
            $push: { 
              _id: "$_id",
              name: "$name",
              profile_image: "$profile_image",
              location: "$location",
              products:"$products",
              categories:"$categories",
            } 
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } } // Sort markets alphabetically
    ]);

    res.status(200).json({
      success: true,
      data: groupedVendors
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};


const getVendorProducts = async(req,res)=>{
  try{
   // const vendor = req.user.id
    const vendor = await Vendor.findOne({user:req.user.id})
    const products = await Product.find({vendor:vendor._id})
    return res.status(200).json(products)

  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
}

const getMyVendorProfile = async(req,res)=>{
  try{
    console.log("Receiving Get Profile Request")
  
    const user = await User.findById(req.user.id)
    const vendor = await Vendor.findOne({user:user._id}).populate('products')
    
    if(!vendor){
      return res.status(404).json({message:"Vendor not Found"})
    }
    console.log(vendor)
    return res.status(200).json(vendor)

  } catch (error) {
    console.log(error)
    res.status(500).json({ success: false, error: error.message });
  }
}


const updateMyVendorProfile = async (req, res) => {
  try {
    console.log("Receiving Update Profile Request");
    
    const user = await User.findById(req.user.id);
    const vendor = await Vendor.findOne({ user: user._id });

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
          { quality: 'auto:good' }
        ],
      });
    };

    let updatedData = { ...req.body };

    // Remove file objects from updatedData — we don't want to save those as strings
    delete updatedData.storeBanner;
    delete updatedData.profileImage;

    // Handle Store Banner Upload
    if (req.files && req.files.storeBanner) {
      console.log("Uploading new store banner...");
      
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
      console.log("Uploading new profile image...");
      
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

    // ✅ FIX: Use vendor._id, not user._id
    const updatedVendor = await Vendor.findByIdAndUpdate(
      vendor._id,  // ← This was the bug! Was user._id, should be vendor._id
      updatedData,
      { new: true, runValidators: true }
    );

    console.log("Profile updated successfully");

    res.status(200).json({
      success: true,
      data: updatedVendor,
    });
  } catch (error) {
    console.error('Update Vendor Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};



const getVendorOrders = async (req, res) => {
  console.log("Receiving order query request for vendor...");

  try {
    // 1. Get the actual Vendor ID first
    const vendorDoc = await Vendor.findOne({ user: req.user.id });
    
    if (!vendorDoc) {
      return res.status(404).json({ success: false, message: "Vendor profile not found" });
    }

    const vendorId = vendorDoc._id.toString();

    // 2. Find orders where this vendor is present in the subOrders array
    const orders = await Order.find({ 'subOrders.vendor': vendorDoc._id })
      .populate('user', 'firstName lastName phone')
      // Important: We MUST populate the product inside the items array to see product info
      .populate({
        path: 'subOrders.items.product',
        select: 'name images price unit'
      })
      .sort({ createdAt: -1 });

    // 3. Filter the subOrders array safely
    const localizedOrders = orders.map(order => {
      // Find the specific subOrder that belongs to this vendor
      const mySubOrder = order.subOrders.find(
        sub => sub.vendor.toString() === vendorId
      );

      // Safety check: skip if subOrder wasn't found for some reason
      if (!mySubOrder) return null;

      return {
        _id: order._id,
        orderNumber: order._id.toString().slice(-8).toUpperCase(),
        customer: order.user,
        shippingAddress: order.shippingAddress,
        deliverySchedule: order.deliverySchedule,
        deliveryNote: order.deliveryNote,
        // Now returns the products and their info from the suborder
        items: mySubOrder.items,
        vendorStatus: mySubOrder.vendorStatus,
        createdAt: order.createdAt,
        status: order.status // Master order status
      };
    }).filter(order => order !== null); // Clean up any nulls

   

    res.status(200).json({
      success: true,
      count: localizedOrders.length,
      data: localizedOrders
    });

  } catch (error) {
    console.error("Vendor Order Error:", error);
    res.status(400).json({
      success: false,
      message: 'Could not fetch vendor orders',
      error: error.message
    });
  }
};

module.exports = {createVendor,getVendors,getVendor,updateVendor,deleteVendor,getVendorOrders,
  getVendorsByMarket,getVendorProducts,getMyVendorProfile,updateMyVendorProfile}
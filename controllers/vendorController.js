const Vendor = require('../model/Vendor');
const cloudinary = require('../Utils/cloudinaryConfig')
const User = require('../model/User')
const Product = require('../model/Product');
const mongoose = require('mongoose');
const Order = require('../model/Order');



const createVendor = async (req, res) => {
  // Start a transaction to ensure both Vendor and User are created together
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { name, contact } = req.body;

    // 1. Split the name into firstName and lastName
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Vendor';

    let store_banner_url = '';
    let store_banner_cloudinaryId = '';
    let profile_image_url = '';
    let profile_image_cloudinaryId = '';

    // Helper function to handle Cloudinary upload
    const uploadToCloudinary = async (fileBuffer, mimetype, folder) => {
      const b64 = Buffer.from(fileBuffer).toString('base64');
      const dataURI = `data:${mimetype};base64,${b64}`;
      return await cloudinary.uploader.upload(dataURI, {
        folder: `freshy-food/${folder}`,
        resource_type: 'auto',
        transformation: [{ width: 1000, height: 1000, crop: 'limit' }, { quality: 'auto:good' }]
      });
    };

    // 2. Handle Cloudinary Uploads
    if (req.files?.store_banner) {
      const result = await uploadToCloudinary(req.files.store_banner[0].buffer, req.files.store_banner[0].mimetype, 'vendors/banners');
      store_banner_url = result.secure_url;
      store_banner_cloudinaryId = result.public_id;
    }

    if (req.files?.profile_image) {
      const result = await uploadToCloudinary(req.files.profile_image[0].buffer, req.files.profile_image[0].mimetype, 'vendors/profiles');
      profile_image_url = result.secure_url;
      profile_image_cloudinaryId = result.public_id;
    }

    // 3. Create the User first
    // We use the 'contact' from req.body as the phone number
    const user = new User({
      firstName,
      lastName,
      phone: contact,
      role: 'vendor' 
    });
    await user.save({ session });

    // 4. Create the Vendor and link the User ID
    const vendorData = {
      ...req.body,
      user: user._id, // Linking the account
      store_banner: store_banner_url,
      store_banner_cloudinaryId,
      profile_image: profile_image_url,
      profile_image_cloudinaryId
    };

    const vendor = await Vendor.create([vendorData], { session });

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({ 
      success: true, 
      data: { vendor: vendor[0], user } 
    });

  } catch (error) {
    
    await session.abortTransaction();
    session.endSession();

    console.error('Vendor/User Creation Error:', error);
    res.status(400).json({ 
      success: false, 
      message: 'Failed to create vendor account', 
      error: error.message 
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
    
    // 1. Find the existing vendor to get current Cloudinary IDs
    let vendor = await Vendor.findById(id);

    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    const uploadToCloudinary = async (fileBuffer, mimetype, folder) => {
      const b64 = Buffer.from(fileBuffer).toString('base64');
      const dataURI = `data:${mimetype};base64,${b64}`;
      return await cloudinary.uploader.upload(dataURI, {
        folder: `freshy-food/${folder}`,
        resource_type: 'auto',
        transformation: [{ width: 1000, height: 1000, crop: 'limit' }, { quality: 'auto:good' }]
      });
    };

    let updatedData = { ...req.body };

    if (req.files && req.files.store_banner) {
      // Delete old banner if it exists
      if (vendor.store_banner_cloudinaryId) {
        await cloudinary.uploader.destroy(vendor.store_banner_cloudinaryId);
      }
      
      // Upload new banner
      const bannerResult = await uploadToCloudinary(
        req.files.store_banner[0].buffer,
        req.files.store_banner[0].mimetype,
        'vendors/banners'
      );
      updatedData.store_banner = bannerResult.secure_url;
      updatedData.store_banner_cloudinaryId = bannerResult.public_id;
    }

    // 3. Handle Profile Image Update
    if (req.files && req.files.profile_image) {
      // Delete old profile image if it exists
      if (vendor.profile_image_cloudinaryId) {
        await cloudinary.uploader.destroy(vendor.profile_image_cloudinaryId);
      }

      // Upload new profile image
      const profileResult = await uploadToCloudinary(
        req.files.profile_image[0].buffer,
        req.files.profile_image[0].mimetype,
        'vendors/profiles'
      );
      updatedData.profile_image = profileResult.secure_url;
      updatedData.profile_image_cloudinaryId = profileResult.public_id;
    }

    const updatedVendor = await Vendor.findByIdAndUpdate(id, updatedData, {
      new: true,
      runValidators: true
    });

    res.status(200).json({ 
      success: true, 
      data: updatedVendor 
    });

  } catch (error) {
    console.error('Update Vendor Error:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
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
    return res.status(200).json(vendor)

  } catch (error) {
    console.log(error)
    res.status(500).json({ success: false, error: error.message });
  }
}


const updateMyVendorProfile = async (req, res) => {
  try {
  
     console.log("Receiving Update Profile Request")
    const user = await User.findById(req.user.id)
    const vendor = await Vendor.findOne({user:user._id})
    

    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    const uploadToCloudinary = async (fileBuffer, mimetype, folder) => {
      const b64 = Buffer.from(fileBuffer).toString('base64');
      const dataURI = `data:${mimetype};base64,${b64}`;
      return await cloudinary.uploader.upload(dataURI, {
        folder: `freshy-food/${folder}`,
        resource_type: 'auto',
        transformation: [{ width: 1000, height: 1000, crop: 'limit' }, { quality: 'auto:good' }]
      });
    };

    let updatedData = { ...req.body };

    if (req.files && req.files.store_banner) {
      // Delete old banner if it exists
      if (vendor.store_banner_cloudinaryId) {
        await cloudinary.uploader.destroy(vendor.store_banner_cloudinaryId);
      }
      
      // Upload new banner
      const bannerResult = await uploadToCloudinary(
        req.files.store_banner[0].buffer,
        req.files.store_banner[0].mimetype,
        'vendors/banners'
      );
      updatedData.store_banner = bannerResult.secure_url;
      updatedData.store_banner_cloudinaryId = bannerResult.public_id;
    }

    // 3. Handle Profile Image Update
    if (req.files && req.files.profile_image) {
      // Delete old profile image if it exists
      if (vendor.profile_image_cloudinaryId) {
        await cloudinary.uploader.destroy(vendor.profile_image_cloudinaryId);
      }

      // Upload new profile image
      const profileResult = await uploadToCloudinary(
        req.files.profile_image[0].buffer,
        req.files.profile_image[0].mimetype,
        'vendors/profiles'
      );
      updatedData.profile_image = profileResult.secure_url;
      updatedData.profile_image_cloudinaryId = profileResult.public_id;
    }

    const updatedVendor = await Vendor.findByIdAndUpdate(user._id, updatedData, {
      new: true,
      runValidators: true
    });

    res.status(200).json({ 
      success: true, 
      data: updatedVendor 
    });

  } catch (error) {
    console.error('Update Vendor Error:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
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
        select: 'name image price unit'
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
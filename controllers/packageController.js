const Package = require('../model/Package');
const Product = require('../model/Product');
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const cloudinary = require('../Utils/cloudinaryConfig')

// @desc    Get all active packages
// @route   GET /api/packages
// @access  Public
const getAllPackages = asyncHandler(async (req, res) => {
  try {
    const packages = await Package.find({ isActive: true })
      .populate({
        path: 'defaultItems.product',
        select: 'name price image category unit'
      })
      .populate({
        path: 'swapOptions.product',
        select: 'name price image category unit'
      })
      .sort({ basePrice: 1 });

   
    const transformedPackages = packages.map(pkg => ({
      id: pkg._id,
      name: pkg.name,
      image: pkg.image,
      description: pkg.description,
      basePrice: pkg.basePrice,
      priceDisplay: `₵${pkg.basePrice.toFixed(2)}`,
      defaultItems: pkg.defaultItems.map(item => ({
        product: {
          id: item.product._id,
          name: item.product.name,
          price: item.product.price,
          image: item.product.image,
          category: item.product.category,
          unit: item.product.unit,
        },
        quantity: item.quantity,
        totalPrice: item.product.price * item.quantity
      })),
      swapOptions: pkg.swapOptions.map(swap => ({
        product: {
          id: swap.product._id,
          name: swap.product.name,
          price: swap.product.price,
          image: swap.product.image,
          category: swap.product.category,
          unit: swap.product.unit,
        },
        quantity: swap.quantity
      })),
      totalItems: pkg.defaultItems.length,
      totalSwapOptions: pkg.swapOptions.length,
      createdAt: pkg.createdAt,
      updatedAt: pkg.updatedAt
    }));

    res.status(200).json({
      success: true,
      count: transformedPackages.length,
      data: transformedPackages
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching packages',
      error: error.message
    });
  }
});



const getPackageById = asyncHandler(async (req, res) => {
  try {
    const packageId = req.params.id;
    console.log(req.params.id)
    
   
    if (!mongoose.Types.ObjectId.isValid(packageId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid package ID format'
      });
    }

    const pkg = await Package.findById(packageId)
      .populate({
        path: 'defaultItems.product',
        select: 'name price image  category unit description isAvailable countInStock'
      })
      .populate({
        path: 'swapOptions.product',
        select: 'name price image category unit description isAvailable countInStock'
      });

    if (!pkg) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    // Check if package is active (unless admin request)
    if (!pkg.isActive && !req.user?.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'This package is currently unavailable'
      });
    }

    // Calculate package details
    const totalBasePrice = pkg.defaultItems.reduce((sum, item) => {
      return sum + (item.product.price * item.quantity);
    }, 0);

    const savings = totalBasePrice - pkg.basePrice;

    const response = {
      success: true,
      data: {
        id: pkg._id,
        name: pkg.name,
        image: pkg.image,
        description: pkg.description,
        basePrice: pkg.basePrice,
        priceDisplay: `₵${pkg.basePrice.toFixed(2)}`,
        defaultItems: pkg.defaultItems.map(item => ({
          product: {
            id: item.product._id,
            name: item.product.name,
            price: item.product.price,
            priceDisplay: `₵${item.product.price.toFixed(2)}`,
            image: item.product.image,
            category: item.product.category,
            unit: item.product.unit,
            description: item.product.description,
            isAvailable: item.product.isAvailable,
            countInStock: item.product.countInStock
          },
          quantity: item.quantity,
          totalPrice: item.product.price * item.quantity,
          totalPriceDisplay: `₵${(item.product.price * item.quantity).toFixed(2)}`
        })),
        swapOptions: pkg.swapOptions.map(swap => ({
          product: {
            id: swap.product._id,
            name: swap.product.name,
            price: swap.product.price,
            priceDisplay: `₵${swap.product.price.toFixed(2)}`,
            image: swap.product.image,
            category: swap.product.category,
            unit: swap.product.unit,
            description: swap.product.description,
            isAvailable: swap.product.isAvailable,
            countInStock: swap.product.countInStock
          },
          quantity: swap.quantity,
          totalPrice: swap.product.price * swap.quantity,
          totalPriceDisplay: `₵${(swap.product.price * swap.quantity).toFixed(2)}`
        })),
        // Package analytics
        analytics: {
          totalDefaultItems: pkg.defaultItems.length,
          totalSwapOptions: pkg.swapOptions.length,
          calculatedBasePrice: totalBasePrice,
          calculatedBasePriceDisplay: `₵${totalBasePrice.toFixed(2)}`,
          savings: savings > 0 ? savings : 0,
          savingsDisplay: savings > 0 ? `₵${savings.toFixed(2)}` : '₵0.00',
          savingsPercentage: savings > 0 ? Math.round((savings / totalBasePrice) * 100) : 0,
          isActive: pkg.isActive,
          totalWeight: calculateTotalWeight(pkg),
          estimatedDeliveryCost: calculateDeliveryCost(pkg)
        },
        createdAt: pkg.createdAt,
        updatedAt: pkg.updatedAt
      }
    };
   console.log(pkg)
    res.status(200).json(pkg);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching package',
      error: error.message
    });
  }
});


const createPackage = asyncHandler(async (req, res) => {
  try {
    const { 
      name, 
      description, 
      basePrice, 
      defaultItems, 
      swapOptions 
    } = req.body;

    // Check if image file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a package image'
      });
    }

    // Validate required fields
    if (!name || !description || !basePrice || !defaultItems) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, description, basePrice, and defaultItems'
      });
    }

    // Validate basePrice
    const basePriceNumber = parseFloat(basePrice);
    if (isNaN(basePriceNumber) || basePriceNumber <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Base price must be a number greater than 0'
      });
    }

    // Parse defaultItems from JSON string
    let parsedDefaultItems;
    try {
      parsedDefaultItems = JSON.parse(defaultItems);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid default items format'
      });
    }

    // Validate defaultItems
    if (!Array.isArray(parsedDefaultItems) || parsedDefaultItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Default items must be a non-empty array'
      });
    }

    // Check for duplicate products in default items
    const defaultProductIds = parsedDefaultItems.map(item => item.product);
    const hasDuplicates = defaultProductIds.length !== new Set(defaultProductIds).size;
    
    if (hasDuplicates) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate products in default items'
      });
    }

    // Validate products exist
    const defaultProducts = await Product.find({ _id: { $in: defaultProductIds } });
    
    if (defaultProducts.length !== parsedDefaultItems.length) {
      return res.status(400).json({
        success: false,
        message: 'Some products in default items were not found'
      });
    }

    // Parse swapOptions if provided
    let parsedSwapOptions = [];
    if (swapOptions) {
      try {
        parsedSwapOptions = JSON.parse(swapOptions);
        
        if (!Array.isArray(parsedSwapOptions)) {
          return res.status(400).json({
            success: false,
            message: 'Swap options must be an array'
          });
        }

        // Validate swap options products if array is not empty
        if (parsedSwapOptions.length > 0) {
          const swapProductIds = parsedSwapOptions.map(item => item.product);
          const swapProducts = await Product.find({ _id: { $in: swapProductIds } });
          
          if (swapProducts.length !== parsedSwapOptions.length) {
            return res.status(400).json({
              success: false,
              message: 'Some products in swap options were not found'
            });
          }

          // Check for duplicates in swap options
          const swapHasDuplicates = swapProductIds.length !== new Set(swapProductIds).size;
          if (swapHasDuplicates) {
            return res.status(400).json({
              success: false,
              message: 'Duplicate products in swap options'
            });
          }

          // Check if any swap option product is also in default items
          const commonProducts = swapProductIds.filter(id => 
            defaultProductIds.includes(id)
          );
          if (commonProducts.length > 0) {
            return res.status(400).json({
              success: false,
              message: 'Some products appear in both default items and swap options'
            });
          }
        }
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid swap options format'
        });
      }
    }

    // Calculate estimated value
    const estimatedValue = parsedDefaultItems.reduce((total, item) => {
      const product = defaultProducts.find(p => p._id.toString() === item.product);
      const quantity = item.quantity || 1;
      return total + (product.price * quantity);
    }, 0);

    if (basePriceNumber > estimatedValue * 1.5) {
      console.warn(`Package base price (₵${basePriceNumber}) is significantly higher than estimated value (₵${estimatedValue})`);
    }

    // Upload image to Cloudinary
    let imageUrl = '';
    let cloudinaryId = '';
    
    try {
      // Convert buffer to base64 for Cloudinary
      const b64 = Buffer.from(req.file.buffer).toString('base64');
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;
      
      // Upload to Cloudinary
      const cloudinaryResult = await cloudinary.uploader.upload(dataURI, {
        folder: 'freshy-food/packages',
        resource_type: 'auto',
        transformation: [
          { width: 800, height: 600, crop: 'limit' }, 
          { quality: 'auto:good' }, 
        ]
      });
      
      imageUrl = cloudinaryResult.secure_url;
      cloudinaryId = cloudinaryResult.public_id;
      
    } catch (uploadError) {
      console.error('Cloudinary upload error:', uploadError);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload image to Cloudinary',
        error: uploadError.message
      });
    }

    // Create package data object
    const packageData = {
      name,
      description,
      basePrice: basePriceNumber,
      defaultItems: parsedDefaultItems,
      swapOptions: parsedSwapOptions,
      image: imageUrl,
      cloudinaryId,
      isActive: true
    };

    // Create package
    const newPackage = await Package.create(packageData);

    // Populate product details
    const populatedPackage = await Package.findById(newPackage._id)
      .populate({
        path: 'defaultItems.product',
        select: 'name price image category unit'
      })
      .populate({
        path: 'swapOptions.product',
        select: 'name price image category unit'
      });

    res.status(201).json({
      success: true,
      message: 'Package created successfully',
      data: populatedPackage
    });
  } catch (error) {
    console.error('Package creation error:', error);
    
    // Handle duplicate key error (if any)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Package with this name may already exist'
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating package',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});


const updatePackage = asyncHandler(async (req, res) => {
  try {
    const packageId = req.params.id;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(packageId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid package ID format'
      });
    }

    const existingPackage = await Package.findById(packageId);
    if (!existingPackage) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    // Handle image upload if new image is provided
    if (req.file) {
      try {
        // Delete old image from Cloudinary if it exists
        if (existingPackage.cloudinaryId) {
          try {
            await cloudinary.uploader.destroy(existingPackage.cloudinaryId);
          } catch (cloudinaryError) {
            console.warn('Failed to delete old Cloudinary image:', cloudinaryError);
          }
        }

        // Upload new image to Cloudinary
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = `data:${req.file.mimetype};base64,${b64}`;
        
        const cloudinaryResult = await cloudinary.uploader.upload(dataURI, {
          folder: 'freshy-food/packages',
          resource_type: 'auto',
          transformation: [
            { width: 800, height: 600, crop: 'limit' }, 
            { quality: 'auto:good' }, 
          ]
        });
        
        updates.image = cloudinaryResult.secure_url;
        updates.cloudinaryId = cloudinaryResult.public_id;
        
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({
          success: false,
          message: 'Failed to upload image to Cloudinary',
          error: uploadError.message
        });
      }
    }

    // Validate products if updating items
    if (updates.defaultItems) {
      let parsedDefaultItems;
      try {
        parsedDefaultItems = typeof updates.defaultItems === 'string' 
          ? JSON.parse(updates.defaultItems) 
          : updates.defaultItems;
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid default items format'
        });
      }

      const defaultItemIds = parsedDefaultItems.map(item => item.product);
      const defaultProducts = await Product.find({ _id: { $in: defaultItemIds } });
      
      if (defaultProducts.length !== parsedDefaultItems.length) {
        return res.status(400).json({
          success: false,
          message: 'Some products in default items were not found'
        });
      }

      // Check for duplicates
      const hasDuplicates = defaultItemIds.length !== new Set(defaultItemIds).size;
      if (hasDuplicates) {
        return res.status(400).json({
          success: false,
          message: 'Duplicate products in default items'
        });
      }

      updates.defaultItems = parsedDefaultItems;
    }

    if (updates.swapOptions) {
      let parsedSwapOptions;
      try {
        parsedSwapOptions = typeof updates.swapOptions === 'string' 
          ? JSON.parse(updates.swapOptions) 
          : updates.swapOptions;
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid swap options format'
        });
      }

      if (Array.isArray(parsedSwapOptions) && parsedSwapOptions.length > 0) {
        const swapItemIds = parsedSwapOptions.map(item => item.product);
        const swapProducts = await Product.find({ _id: { $in: swapItemIds } });
        
        if (swapProducts.length !== parsedSwapOptions.length) {
          return res.status(400).json({
            success: false,
            message: 'Some products in swap options were not found'
          });
        }

        // Check for duplicates
        const hasDuplicates = swapItemIds.length !== new Set(swapItemIds).size;
        if (hasDuplicates) {
          return res.status(400).json({
            success: false,
            message: 'Duplicate products in swap options'
          });
        }
      }

      updates.swapOptions = parsedSwapOptions;
    }

    // Validate base price if updating
    if (updates.basePrice) {
      const basePriceNumber = parseFloat(updates.basePrice);
      if (isNaN(basePriceNumber) || basePriceNumber <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Base price must be a number greater than 0'
        });
      }
      updates.basePrice = basePriceNumber;
    }

    // Update package
    Object.keys(updates).forEach(key => {
      if (key !== '_id' && key !== 'createdAt' && key !== 'updatedAt') {
        existingPackage[key] = updates[key];
      }
    });

    await existingPackage.save();

    // Get populated package for response
    const updatedPackage = await Package.findById(packageId)
      .populate({
        path: 'defaultItems.product',
        select: 'name price image category unit'
      })
      .populate({
        path: 'swapOptions.product',
        select: 'name price image category unit'
      });

    res.status(200).json({
      success: true,
      message: 'Package updated successfully',
      data: updatedPackage
    });
  } catch (error) {
    console.error('Package update error:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Package with this name already exists'
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error updating package',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

const deletePackage = asyncHandler(async (req, res) => {
  try {
    const packageId = req.params.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(packageId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid package ID format'
      });
    }

    const pkg = await Package.findById(packageId);
    if (!pkg) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    pkg.isActive = false;
    await pkg.save();

    res.status(200).json({
      success: true,
      message: 'Package deactivated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting package',
      error: error.message
    });
  }
});


const togglePackageStatus = asyncHandler(async (req, res) => {
  try {
    const packageId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(packageId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid package ID format'
      });
    }

    const pkg = await Package.findById(packageId);
    if (!pkg) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    pkg.isActive = !pkg.isActive;
    await pkg.save();

    res.status(200).json({
      success: true,
      message: `Package ${pkg.isActive ? 'activated' : 'deactivated'} successfully`,
      data: {
        id: pkg._id,
        name: pkg.name,
        isActive: pkg.isActive
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error toggling package status',
      error: error.message
    });
  }
});


const getPackagesByCategory = asyncHandler(async (req, res) => {
  try {
    const { category } = req.params;
    const { minPrice, maxPrice, sort = 'price' } = req.query;

    let query = { isActive: true };
    
    // Extract category from package name (you might want to add a category field to schema)
    if (category !== 'all') {
      query.name = { $regex: new RegExp(category, 'i') };
    }

    // Price filtering
    if (minPrice) {
      query.basePrice = { $gte: Number(minPrice) };
    }
    if (maxPrice) {
      query.basePrice = { ...query.basePrice, $lte: Number(maxPrice) };
    }

    // Sorting
    let sortOption = {};
    switch (sort) {
      case 'price-desc':
        sortOption = { basePrice: -1 };
        break;
      case 'name':
        sortOption = { name: 1 };
        break;
      case 'newest':
        sortOption = { createdAt: -1 };
        break;
      default:
        sortOption = { basePrice: 1 }; // price-asc
    }

    const packages = await Package.find(query)
      .populate({
        path: 'defaultItems.product',
        select: 'name price image emoji category'
      })
      .populate({
        path: 'swapOptions.product',
        select: 'name price image emoji category'
      })
      .sort(sortOption);

    res.status(200).json({
      success: true,
      count: packages.length,
      filters: {
        category,
        minPrice: minPrice || 'any',
        maxPrice: maxPrice || 'any',
        sort
      },
      data: packages
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching packages by category',
      error: error.message
    });
  }
});

// @desc    Get swap options for a specific item in package
// @route   GET /api/packages/:packageId/swaps/:productId
// @access  Public
const getSwapOptionsForItem = asyncHandler(async (req, res) => {
  try {
    const { packageId, productId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(packageId) || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ID format'
      });
    }

    const pkg = await Package.findById(packageId)
      .populate({
        path: 'swapOptions.product',
        select: 'name price image category unit  description isAvailable'
      })
      .populate({
        path: 'defaultItems.product',
        select: 'name price'
      });

    if (!pkg) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    // Check if product exists in package default items
    const productInPackage = pkg.defaultItems.find(item => 
      item.product._id.toString() === productId
    );

    if (!productInPackage) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in this package'
      });
    }

   
    const swapOptions = pkg.swapOptions.map(swap => ({
      id: swap.product._id,
      name: swap.product.name,
      price: swap.product.price,
      priceDisplay: `₵${swap.product.price.toFixed(2)}`,
      image: swap.product.image,
      category: swap.product.category,
      unit: swap.product.unit,
      description: swap.product.description,
      isAvailable: swap.product.isAvailable,
      quantity: swap.quantity,
      totalPrice: swap.product.price * swap.quantity,
      totalPriceDisplay: `₵${(swap.product.price * swap.quantity).toFixed(2)}`,
      // Compare with original item
      priceDifference: swap.product.price - productInPackage.product.price,
      priceDifferenceDisplay: `₵${(swap.product.price - productInPackage.product.price).toFixed(2)}`,
      isCheaper: swap.product.price < productInPackage.product.price
    }));

    // Original item info
    const originalItem = {
      id: productInPackage.product._id,
      name: productInPackage.product.name,
      price: productInPackage.product.price,
      priceDisplay: `₵${productInPackage.product.price.toFixed(2)}`,
      quantity: productInPackage.quantity,
      totalPrice: productInPackage.product.price * productInPackage.quantity,
      totalPriceDisplay: `₵${(productInPackage.product.price * productInPackage.quantity).toFixed(2)}`
    };

    res.status(200).json({
      success: true,
      data: {
        originalItem,
        swapOptions,
        totalSwapOptions: swapOptions.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching swap options',
      error: error.message
    });
  }
});

// @desc    Validate package customization
// @route   POST /api/packages/:id/validate-customization
// @access  Public
const validateCustomization = asyncHandler(async (req, res) => {
  try {
    const packageId = req.params.id;
    const { customizedItems } = req.body; // Array of { productId, quantity }

    if (!mongoose.Types.ObjectId.isValid(packageId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid package ID format'
      });
    }

    const pkg = await Package.findById(packageId)
      .populate({
        path: 'defaultItems.product',
        select: 'name price'
      });

    if (!pkg) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    const errors = [];
    const warnings = [];

    // Check all default items are included (or swapped)
    const customizedProductIds = customizedItems.map(item => item.productId);
    
    pkg.defaultItems.forEach(defaultItem => {
      const isIncluded = customizedProductIds.includes(defaultItem.product._id.toString());
      
      if (!isIncluded) {
        errors.push(`${defaultItem.product.name} is missing from your customization`);
      }
    });

    // Check quantities are reasonable
    customizedItems.forEach(item => {
      if (item.quantity < 1) {
        errors.push(`Quantity for item must be at least 1`);
      }
      if (item.quantity > 10) {
        warnings.push(`Large quantity (${item.quantity}) for an item - consider contacting support`);
      }
    });

    // Calculate total cost
    const productIds = customizedItems.map(item => item.productId);
    const products = await Product.find({ _id: { $in: productIds } });
    
    let totalCost = 0;
    customizedItems.forEach(customItem => {
      const product = products.find(p => p._id.toString() === customItem.productId);
      if (product) {
        totalCost += product.price * customItem.quantity;
      }
    });

    // Compare with package base price
    const priceDifference = totalCost - pkg.basePrice;
    const savings = pkg.basePrice - totalCost;

    if (priceDifference > 0) {
      warnings.push(`Your customization costs ₵${priceDifference.toFixed(2)} more than the package price`);
    } else if (savings > 0) {
      warnings.push(`Your customization saves ₵${savings.toFixed(2)} compared to individual purchase`);
    }

    res.status(200).json({
      success: true,
      data: {
        isValid: errors.length === 0,
        errors,
        warnings,
        priceComparison: {
          packagePrice: pkg.basePrice,
          customizedPrice: totalCost,
          difference: priceDifference,
          savings: savings > 0 ? savings : 0,
          isCheaperThanIndividual: savings > 0
        },
        recommendations: errors.length === 0 ? [] : [
          'Ensure all default items are included',
          'Consider using swap options for items you don\'t want',
          'Contact support for help with customization'
        ]
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error validating customization',
      error: error.message
    });
  }
});

// @desc    Get package analytics
// @route   GET /api/packages/analytics
// @access  Private/Admin
const getPackageAnalytics = asyncHandler(async (req, res) => {
  try {
    // Get total packages count
    const totalPackages = await Package.countDocuments();
    const activePackages = await Package.countDocuments({ isActive: true });
    
    // Get price range
    const priceStats = await Package.aggregate([
      {
        $group: {
          _id: null,
          avgPrice: { $avg: '$basePrice' },
          minPrice: { $min: '$basePrice' },
          maxPrice: { $max: '$basePrice' },
          totalValue: { $sum: '$basePrice' }
        }
      }
    ]);

    // Get packages by item count
    const itemCountStats = await Package.aggregate([
      {
        $project: {
          name: 1,
          itemCount: { $size: '$defaultItems' },
          swapCount: { $size: '$swapOptions' }
        }
      },
      {
        $group: {
          _id: null,
          avgItems: { $avg: '$itemCount' },
          avgSwaps: { $avg: '$swapCount' }
        }
      }
    ]);

    // Get recently created packages
    const recentPackages = await Package.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name basePrice isActive createdAt');

    res.status(200).json({
      success: true,
      data: {
        counts: {
          total: totalPackages,
          active: activePackages,
          inactive: totalPackages - activePackages
        },
        pricing: priceStats[0] || {},
        items: itemCountStats[0] || {},
        recent: recentPackages,
        lastUpdated: new Date()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching package analytics',
      error: error.message
    });
  }
});

// Helper function to calculate total weight (example)
const calculateTotalWeight = (pkg) => {
  // This assumes products have weight field
  let totalWeight = 0;
  pkg.defaultItems.forEach(item => {
    if (item.product.weight) {
      totalWeight += item.product.weight * item.quantity;
    }
  });
  return totalWeight;
};

// Helper function to calculate delivery cost (example)
const calculateDeliveryCost = (pkg) => {
  const totalWeight = calculateTotalWeight(pkg);
  // Simple delivery cost calculation based on weight
  if (totalWeight < 5) return 0; // Free delivery for light packages
  if (totalWeight < 10) return 5; // ₵5 for medium packages
  return 10; // ₵10 for heavy packages
};

module.exports = {
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
};
const Product = require('../model/Product');
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const slugify = require('slugify');
const cloudinary = require('../Utils/cloudinaryConfig')

// Helper function to generate slug
const generateSlug = (name) => {
  return slugify(name, {
    lower: true,
    strict: true,
    trim: true
  });
};

// @desc    Get all products with filtering
// @route   GET /api/products
// @access  Public
const getAllProducts = asyncHandler(async (req, res) => {
  try {
    const {
      category,
      search,
      minPrice,
      maxPrice,
      isAvailable,
      sort = 'name',
      page = 1,
      limit = 20
    } = req.query;

    // Build query object
    let query = {};

    // Filter by category
    if (category) {
      if (category === 'all') {
        // Show all categories
      } else if (category === 'vegetables') {
        query.category = { $in: ['vegetable', 'herb', 'tuber'] };
      } else if (category === 'fruits') {
        query.category = 'fruit';
      } else if (category === 'staples') {
        query.category = { $in: ['staple', 'tuber'] };
      } else {
        query.category = category;
      }
    }

    // Search by name or description
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Price range filtering
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // Availability filter
    if (isAvailable !== undefined) {
      query.isAvailable = isAvailable === 'true';
    }

    // Sorting
    let sortOption = {};
    switch (sort) {
      case 'price-asc':
        sortOption = { price: 1 };
        break;
      case 'price-desc':
        sortOption = { price: -1 };
        break;
      case 'newest':
        sortOption = { createdAt: -1 };
        break;
      case 'stock-desc':
        sortOption = { countInStock: -1 };
        break;
      case 'name-desc':
        sortOption = { name: -1 };
        break;
      default:
        sortOption = { name: 1 }; // name-asc
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Execute query with pagination
    const [products, total] = await Promise.all([
      Product.find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .select('-__v'),
      Product.countDocuments(query)
    ]);

    // Transform products for frontend
    const transformedProducts = products.map(product => ({
      id: product._id,
      name: product.name,
      slug: product.slug,
      category: product.category,
      categoryDisplay: getCategoryDisplay(product.category),
      image: product.image,
      price: product.price,
      priceDisplay: formatPrice(product.price),
      unit: product.unit,
      unitDisplay: getUnitDisplay(product.unit),
      countInStock: product.countInStock,
      stockStatus: getStockStatus(product.countInStock),
      isAvailable: product.isAvailable,
      description: product.description,
      isLowStock: product.countInStock <= 10 && product.countInStock > 0,
      isOutOfStock: product.countInStock === 0,
      inStock: product.countInStock > 0,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    }));

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    res.status(200).json({
      success: true,
      count: transformedProducts.length,
      total,
      pagination: {
        currentPage: pageNum,
        totalPages,
        limit: limitNum,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? pageNum + 1 : null,
        prevPage: hasPrevPage ? pageNum - 1 : null
      },
      filters: {
        category: category || 'all',
        search: search || '',
        minPrice: minPrice || null,
        maxPrice: maxPrice || null,
        isAvailable: isAvailable || null,
        sort
      },
      data: transformedProducts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching products',
      error: error.message
    });
  }
});

// @desc    Get single product by ID or slug
// @route   GET /api/products/:identifier
// @access  Public
const getProductById = asyncHandler(async (req, res) => {
  try {
    const { identifier } = req.params;

    let product;
    
    // Check if identifier is a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(identifier)) {
      product = await Product.findById(identifier);
    } else {
      // Otherwise treat as slug
      product = await Product.findOne({ slug: identifier });
    }

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Get related products (same category)
    const relatedProducts = await Product.find({
      _id: { $ne: product._id },
      category: product.category,
      isAvailable: true
    })
    .limit(4)
    .select('name slug image price unit countInStock');

    const response = {
      success: true,
      data: {
        id: product._id,
        name: product.name,
        slug: product.slug,
        category: product.category,
        categoryDisplay: getCategoryDisplay(product.category),
        image: product.image,
        price: product.price,
        priceDisplay: formatPrice(product.price),
        unit: product.unit,
        unitDisplay: getUnitDisplay(product.unit),
        countInStock: product.countInStock,
        stockStatus: getStockStatus(product.countInStock),
        isAvailable: product.isAvailable,
        description: product.description,
        nutritionalInfo: product.nutritionalInfo || null,
        storageTips: product.storageTips || '',
        shelfLifeDays: product.shelfLifeDays || 7,
        isLowStock: product.countInStock <= 10 && product.countInStock > 0,
        isOutOfStock: product.countInStock === 0,
        inStock: product.countInStock > 0,
        tags: product.tags || [],
        seasonality: product.seasonality || [],
        isInSeason: checkIfInSeason(product.seasonality),
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        relatedProducts: relatedProducts.map(p => ({
          id: p._id,
          name: p.name,
          slug: p.slug,
          image: p.image,
          price: p.price,
          priceDisplay: formatPrice(p.price),
          unit: p.unit,
          countInStock: p.countInStock,
          inStock: p.countInStock > 0
        }))
      }
    };

    res.status(200).json(product);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching product',
      error: error.message
    });
  }
});

// @desc    Get products by category
// @route   GET /api/products/category/:category
// @access  Public
const getProductsByCategory = asyncHandler(async (req, res) => {
  try {
    const { category } = req.params;
    const { sort = 'name', limit = 50 } = req.query;

    // Validate category
    const validCategories = ['vegetable', 'fruit', 'staple', 'herb', 'other', 'tuber'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category',
        validCategories
      });
    }

    // Sorting
    let sortOption = {};
    switch (sort) {
      case 'price-asc':
        sortOption = { price: 1 };
        break;
      case 'price-desc':
        sortOption = { price: -1 };
        break;
      case 'stock-desc':
        sortOption = { countInStock: -1 };
        break;
      default:
        sortOption = { name: 1 };
    }

    const products = await Product.find({ 
      category, 
      isAvailable: true 
    })
    .sort(sortOption)
    .limit(parseInt(limit))
    .select('name slug image price unit countInStock description');

    // Category statistics
    const categoryStats = {
      total: products.length,
      inStock: products.filter(p => p.countInStock > 0).length,
      outOfStock: products.filter(p => p.countInStock === 0).length,
      lowStock: products.filter(p => p.countInStock <= 10 && p.countInStock > 0).length,
      priceRange: products.length > 0 ? {
        min: Math.min(...products.map(p => p.price)),
        max: Math.max(...products.map(p => p.price)),
        avg: products.reduce((sum, p) => sum + p.price, 0) / products.length
      } : null
    };

    res.status(200).json({
      success: true,
      category: {
        name: category,
        displayName: getCategoryDisplay(category)
      },
      stats: categoryStats,
      count: products.length,
      data: products.map(p => ({
        id: p._id,
        name: p.name,
        slug: p.slug,
        image: p.image,
        price: p.price,
        priceDisplay: formatPrice(p.price),
        unit: p.unit,
        unitDisplay: getUnitDisplay(p.unit),
        countInStock: p.countInStock,
        inStock: p.countInStock > 0,
        isLowStock: p.countInStock <= 10 && p.countInStock > 0,
        description: p.description ? p.description.substring(0, 100) + '...' : null
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching products by category',
      error: error.message
    });
  }
});


const createProduct = asyncHandler(async (req, res) => {
  try {
    const {
      name,
      category,
      price,
      unit,
      countInStock,
      description,
      isAvailable
    } = req.body;

    // Validate required fields
    if (!name || !category || !price || !unit) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, category, price, and unit'
      });
    }

    // Check if image file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a product image'
      });
    }

    // Validate category
    const validCategories = ['vegetable', 'fruit', 'staple', 'herb', 'other', 'tuber'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category',
        validCategories
      });
    }

    // Validate unit
    const validUnits = ['kg', 'g', 'piece', 'pieces', 'bunch', 'bag', 'pack', 'basket', 'olonka'];
    if (!validUnits.includes(unit)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid unit',
        validUnits
      });
    }

    // Validate price
    const priceNumber = parseFloat(price);
    if (isNaN(priceNumber) || priceNumber <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Price must be a number greater than 0'
      });
    }

    // Validate stock
    const stockCount = countInStock ? parseInt(countInStock) : 0;
    if (isNaN(stockCount) || stockCount < 0) {
      return res.status(400).json({
        success: false,
        message: 'Stock count must be a non-negative number'
      });
    }

    // Generate slug
    const slug = generateSlug(name);
    
    // Check if slug already exists
    const existingProduct = await Product.findOne({ slug });
    let finalSlug = slug;
    if (existingProduct) {
      // Add timestamp to make slug unique
      finalSlug = `${slug}-${Date.now()}`;
    }

    // Upload image to Cloudinary
    let imageUrl = '';
    let imagePublicId = '';
    
    try {
      // Convert buffer to base64 for Cloudinary
      const b64 = Buffer.from(req.file.buffer).toString('base64');
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;
      
      // Upload to Cloudinary
      const cloudinaryResult = await cloudinary.uploader.upload(dataURI, {
        folder: 'freshy-food/products',
        resource_type: 'auto',
        transformation: [
          { width: 800, height: 800, crop: 'limit' }, 
          { quality: 'auto:good' }, 
        ]
      });
      
      imageUrl = cloudinaryResult.secure_url;
      imagePublicId = cloudinaryResult.public_id;
      
    } catch (uploadError) {
      console.error('Cloudinary upload error:', uploadError);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload image to Cloudinary',
        error: uploadError.message
      });
    }

    // Create product data object (only fields from schema)
    const productData = {
      name,
      slug: finalSlug,
      category,
      image: imageUrl,
      cloudinaryId: imagePublicId,
      price: priceNumber,
      unit,
      countInStock: stockCount,
      description: description || '',
      isAvailable: isAvailable !== undefined ? (isAvailable === 'true' || isAvailable === true) : true
    };

    // Create product
    const product = await Product.create(productData);

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: {
        id: product._id,
        name: product.name,
        slug: product.slug,
        category: product.category,
        image: product.image,
        price: product.price,
        unit: product.unit,
        countInStock: product.countInStock,
        isAvailable: product.isAvailable,
        description: product.description,
        cloudinaryId: product.cloudinaryId,
        createdAt: product.createdAt
      }
    });
  } catch (error) {
    console.error('Product creation error:', error);
    
    // Handle duplicate key error (unique slug)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Product with this name already exists'
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
      message: 'Error creating product',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});
// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = asyncHandler(async (req, res) => {
  try {
    const productId = req.params.id;
    const updates = req.body;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format'
      });
    }

    // Find product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Handle image upload if new image is provided
    if (req.file) {
      try {
        // Delete old image from Cloudinary if it exists
        if (product.cloudinaryId) {
          try {
            await cloudinary.uploader.destroy(product.cloudinaryId);
          } catch (cloudinaryError) {
            console.warn('Failed to delete old Cloudinary image:', cloudinaryError);
          }
        }

        // Upload new image to Cloudinary
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = `data:${req.file.mimetype};base64,${b64}`;
        
        const cloudinaryResult = await cloudinary.uploader.upload(dataURI, {
          folder: 'freshy-food/products',
          resource_type: 'auto',
          transformation: [
            { width: 800, height: 800, crop: 'limit' }, 
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

    // If name is being updated, generate new slug
    if (updates.name && updates.name !== product.name) {
      const newSlug = updates.name
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/--+/g, '-')
        .trim();
      
      // Check if new slug exists (different from current)
      const existingWithSlug = await Product.findOne({ 
        slug: newSlug,
        _id: { $ne: productId }
      });
      
      if (existingWithSlug) {
        return res.status(400).json({
          success: false,
          message: 'Product with similar name already exists'
        });
      }
      
      updates.slug = newSlug;
    }

    // Validate category if being updated
    if (updates.category) {
      const validCategories = ['vegetable', 'fruit', 'staple', 'herb', 'other', 'tuber'];
      if (!validCategories.includes(updates.category)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category'
        });
      }
    }

    // Validate unit if being updated
    if (updates.unit) {
      const validUnits = ['kg', 'g', 'piece', 'pieces', 'bunch', 'bag', 'pack', 'basket', 'olonka'];
      if (!validUnits.includes(updates.unit)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid unit'
        });
      }
    }

    // Validate price if being updated
    if (updates.price) {
      const priceNumber = parseFloat(updates.price);
      if (isNaN(priceNumber) || priceNumber <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Price must be a number greater than 0'
        });
      }
      updates.price = priceNumber;
    }

    // Validate stock if being updated
    if (updates.countInStock !== undefined) {
      const stockCount = parseInt(updates.countInStock);
      if (isNaN(stockCount) || stockCount < 0) {
        return res.status(400).json({
          success: false,
          message: 'Stock count must be a non-negative number'
        });
      }
      updates.countInStock = stockCount;
    }

    // Validate isAvailable if being updated
    if (updates.isAvailable !== undefined) {
      updates.isAvailable = updates.isAvailable === 'true' || updates.isAvailable === true;
    }

    // Update product
    Object.keys(updates).forEach(key => {
      if (key !== '_id' && key !== 'createdAt' && key !== 'updatedAt') {
        product[key] = updates[key];
      }
    });

    await product.save();

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: {
        id: product._id,
        name: product.name,
        slug: product.slug,
        category: product.category,
        image: product.image,
        price: product.price,
        unit: product.unit,
        countInStock: product.countInStock,
        isAvailable: product.isAvailable,
        description: product.description,
        cloudinaryId: product.cloudinaryId,
        updatedAt: product.updatedAt
      }
    });
  } catch (error) {
    console.error('Product update error:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Product with this name already exists'
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
      message: 'Error updating product',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = asyncHandler(async (req, res) => {
  try {
    const productId = req.params.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format'
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if product is used in any active packages
    // You might want to add this check when you have Package model
    // const packageCount = await Package.countDocuments({
    //   $or: [
    //     { 'defaultItems.product': productId },
    //     { 'swapOptions.product': productId }
    //   ]
    // });
    
    // if (packageCount > 0) {
    //   return res.status(400).json({
    //     success: false,
    //     message: `Cannot delete product used in ${packageCount} packages`
    //   });
    // }

    // Soft delete by setting isAvailable to false
    // Or hard delete if you prefer:
    // await product.remove();
    
    product.isAvailable = false;
    await product.save();

    res.status(200).json({
      success: true,
      message: 'Product marked as unavailable'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting product',
      error: error.message
    });
  }
});

// @desc    Update product stock
// @route   PATCH /api/products/:id/stock
// @access  Private/Admin
const updateProductStock = asyncHandler(async (req, res) => {
  try {
    const productId = req.params.id;
    const { operation, quantity, reason } = req.body;

    // Validate
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format'
      });
    }

    if (!operation || !['add', 'subtract', 'set'].includes(operation)) {
      return res.status(400).json({
        success: false,
        message: 'Valid operation required: add, subtract, or set'
      });
    }

    if (quantity === undefined || quantity < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid quantity required (non-negative)'
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    let newStock;
    switch (operation) {
      case 'add':
        newStock = product.countInStock + quantity;
        break;
      case 'subtract':
        newStock = product.countInStock - quantity;
        if (newStock < 0) {
          return res.status(400).json({
            success: false,
            message: `Cannot subtract ${quantity} from ${product.countInStock} stock`
          });
        }
        break;
      case 'set':
        newStock = quantity;
        break;
    }

    const oldStock = product.countInStock;
    product.countInStock = newStock;
    
    // Auto-update availability based on stock
    if (newStock === 0) {
      product.isAvailable = false;
    } else if (newStock > 0 && !product.isAvailable) {
      product.isAvailable = true;
    }

    await product.save();

    // Log stock change (you might want to save to a separate collection)
    const stockChange = {
      productId,
      productName: product.name,
      oldStock,
      newStock,
      operation,
      quantity,
      reason: reason || 'Manual update',
      changedBy: req.user?.id || 'system',
      changedAt: new Date()
    };

    // You can save stockChange to a StockHistory collection here

    res.status(200).json({
      success: true,
      message: 'Stock updated successfully',
      data: {
        id: product._id,
        name: product.name,
        oldStock,
        newStock,
        operation,
        quantity,
        change: newStock - oldStock,
        isAvailable: product.isAvailable,
        stockStatus: getStockStatus(newStock),
        stockChange // For logging
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating stock',
      error: error.message
    });
  }
});

// @desc    Bulk update product availability
// @route   PATCH /api/products/bulk/availability
// @access  Private/Admin
const bulkUpdateAvailability = asyncHandler(async (req, res) => {
  try {
    const { productIds, isAvailable } = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Product IDs array required'
      });
    }

    if (isAvailable === undefined) {
      return res.status(400).json({
        success: false,
        message: 'isAvailable status required'
      });
    }

    // Validate all IDs
    const validIds = productIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length !== productIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some product IDs are invalid'
      });
    }

    const result = await Product.updateMany(
      { _id: { $in: validIds } },
      { isAvailable }
    );

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} products updated`,
      data: {
        totalSelected: validIds.length,
        updatedCount: result.modifiedCount,
        isAvailable
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error in bulk update',
      error: error.message
    });
  }
});

// @desc    Search products
// @route   GET /api/products/search/:query
// @access  Public
const searchProducts = asyncHandler(async (req, res) => {
  try {
    console.log(req.params)
    console.log("I'm being called")
    const { query } = req.params;
    const { limit = 10 } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters'
      });
    }

    const products = await Product.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { tags: { $regex: query, $options: 'i' } }
      ],
      isAvailable: true
    })
    .limit(parseInt(limit))
    .select('name slug image price unit countInStock category');

    const suggestions = products.map(p => ({
      id: p._id,
      name: p.name,
      slug: p.slug,
      image: p.image,
      price: p.price,
      priceDisplay: formatPrice(p.price),
      unit: p.unit,
      category: p.category,
      categoryDisplay: getCategoryDisplay(p.category),
      inStock: p.countInStock > 0
    }));
    console.log(suggestions)

    res.status(200).json({
      success: true,
      query,
      count: products.length,
      suggestions:products
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error searching products',
      error: error.message
    });
  }
});

// @desc    Get products dashboard statistics
// @route   GET /api/products/stats/overview
// @access  Private/Admin
const getProductStats = asyncHandler(async (req, res) => {
  try {
    // Get total counts
    const totalProducts = await Product.countDocuments();
    const availableProducts = await Product.countDocuments({ isAvailable: true });
    const outOfStockProducts = await Product.countDocuments({ countInStock: 0 });
    const lowStockProducts = await Product.countDocuments({ 
      countInStock: { $gt: 0, $lte: 10 } 
    });

    // Get category distribution
    const categoryStats = await Product.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalStock: { $sum: '$countInStock' },
          avgPrice: { $avg: '$price' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Get price statistics
    const priceStats = await Product.aggregate([
      {
        $group: {
          _id: null,
          avgPrice: { $avg: '$price' },
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' },
          totalValue: { $sum: { $multiply: ['$price', '$countInStock'] } }
        }
      }
    ]);

    // Get recently added products
    const recentProducts = await Product.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name category price countInStock createdAt');

    // Get low stock alert
    const lowStockAlerts = await Product.find({
      countInStock: { $gt: 0, $lte: 10 }
    })
    .sort({ countInStock: 1 })
    .limit(10)
    .select('name category countInStock unit');

    res.status(200).json({
      success: true,
      data: {
        counts: {
          total: totalProducts,
          available: availableProducts,
          outOfStock: outOfStockProducts,
          lowStock: lowStockProducts,
          unavailable: totalProducts - availableProducts
        },
        categories: categoryStats,
        pricing: priceStats[0] || {},
        recent: recentProducts,
        alerts: {
          lowStock: lowStockAlerts,
          count: lowStockAlerts.length
        },
        lastUpdated: new Date()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching product statistics',
      error: error.message
    });
  }
});

// @desc    Get seasonal products
// @route   GET /api/products/seasonal/current
// @access  Public
const getSeasonalProducts = asyncHandler(async (req, res) => {
  try {
    const currentMonth = new Date().toLocaleString('en-US', { month: 'short' }).toLowerCase();
    
    // If you have seasonality field in your schema
    // const seasonalProducts = await Product.find({
    //   seasonality: currentMonth,
    //   isAvailable: true
    // })
    // .limit(12)
    // .select('name slug image price category unit description');
    
    // For now, get featured products or products in season
    const seasonalProducts = await Product.find({
      isAvailable: true,
      category: { $in: ['fruit', 'vegetable'] }
    })
    .sort({ createdAt: -1 })
    .limit(12)
    .select('name slug image price category unit description countInStock');

    res.status(200).json({
      success: true,
      season: getSeasonDisplay(currentMonth),
      month: currentMonth,
      count: seasonalProducts.length,
      data: seasonalProducts.map(p => ({
        id: p._id,
        name: p.name,
        slug: p.slug,
        image: p.image,
        price: p.price,
        priceDisplay: formatPrice(p.price),
        category: p.category,
        categoryDisplay: getCategoryDisplay(p.category),
        unit: p.unit,
        unitDisplay: getUnitDisplay(p.unit),
        inSeason: true,
        description: p.description,
        inStock: p.countInStock > 0
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching seasonal products',
      error: error.message
    });
  }
});

// Helper functions
const formatPrice = (price) => {
  return `₵${price.toFixed(2)}`;
};

const getCategoryDisplay = (category) => {
  const displays = {
    vegetable: 'Vegetables',
    fruit: 'Fruits',
    staple: 'Staples',
    herb: 'Herbs',
    tuber: 'Tubers',
    other: 'Other'
  };
  return displays[category] || category;
};

const getUnitDisplay = (unit) => {
  const displays = {
    kg: 'Kilogram',
    g: 'Gram',
    piece: 'Piece',
    bunch: 'Bunch',
    bag: 'Bag',
    pack: 'Pack'
  };
  return displays[unit] || unit;
};

const getStockStatus = (stock) => {
  if (stock === 0) return 'Out of Stock';
  if (stock <= 10) return 'Low Stock';
  return 'In Stock';
};

const checkIfInSeason = (seasonality) => {
  if (!seasonality || seasonality.length === 0) return true;
  const currentMonth = new Date().toLocaleString('en-US', { month: 'short' }).toLowerCase();
  return seasonality.includes(currentMonth);
};

const getSeasonDisplay = (month) => {
  const seasons = {
    dec: 'Winter', jan: 'Winter', feb: 'Winter',
    mar: 'Spring', apr: 'Spring', may: 'Spring',
    jun: 'Summer', jul: 'Summer', aug: 'Summer',
    sep: 'Autumn', oct: 'Autumn', nov: 'Autumn'
  };
  return seasons[month] || 'Current';
};

module.exports = {
  getAllProducts,
  getProductById,
  getProductsByCategory,
  createProduct,
  updateProduct,
  deleteProduct,
  updateProductStock,
  bulkUpdateAvailability,
  searchProducts,
  getProductStats,
  getSeasonalProducts
};
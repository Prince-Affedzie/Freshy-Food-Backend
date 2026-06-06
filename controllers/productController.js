const Product = require('../model/Product');
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const slugify = require('slugify');
const redis = require("../config/redis");
const Vendor = require('../model/Vendor');
const { 
  uploadMultipleProductImages, 
  deleteMultipleProductImages 
} = require('../config/supabaseS3');

const generateSlug = (name) => {
  return slugify(name, { lower: true, strict: true, trim: true });
};

const invalidateProductCache = async () => {
  try {
    const keys = await redis.keys("products:*");
    if (keys.length) await redis.del(keys);
  } catch (err) {
    console.log("Cache invalidation error:", err.message);
  }
};

const VALID_CATEGORIES = [
  "electronics",
  "phones and tablets",
  "computers and laptops",
  "gaming",
  "fashion",
  "books-course-materials",
  "hostel-items",
  "appliances",
  "furniture",
  "beauty and grooming",
  "sports and fitness",
  "accessories",
  "food and drinks",
  "services",
  "other",
];

const VALID_SUBCATEGORIES = [
  "headphones-earbuds", "speakers", "chargers-cables", "power-banks",
  "smartwatches", "cameras", "other-electronics",
  "smartphones", "tablets", "ipads", "phone-cases", "screen-protectors",
  "other-phone-accessories",
  "laptops", "desktops", "monitors", "keyboards", "mouse",
  "laptop-bags", "software", "other-computer-accessories",
  "consoles", "games", "controllers", "gaming-accessories",
  "men-clothing", "women-clothing", "unisex-clothing", "shoes", "bags",
  "watches", "jewelry", "other-fashion",
  "textbooks", "course-notes", "past-questions", "stationery",
  "novels", "other-books",
  "bedding", "kitchenware", "cleaning-supplies", "storage",
  "lighting", "other-hostel",
  "fans", "heaters", "irons", "kettles", "blenders", "microwaves",
  "other-appliances",
  "chairs", "tables-desks", "beds-mattresses", "shelves", "other-furniture",
  "skincare", "makeup", "hair-care", "perfumes", "nail-care", "other-beauty",
  "sports-equipment", "gym-gear", "activewear", "other-sports",
  "phone-accessories", "laptop-accessories", "fashion-accessories", "other-accessories",
  "snacks", "drinks", "homemade-meals", "baked-goods", "other-food",
  "tutoring", "graphic-design", "photography", "printing-photocopy",
  "laundry", "barbering-hairdressing", "tech-repairs", "other-services",
  "miscellaneous",
];

// @desc    Get all products with filtering, search, sorting, pagination
// @route   GET /api/products
// @access  Public
const getAllProducts = asyncHandler(async (req, res) => {
  const {
    category, subcategory, search, minPrice, maxPrice, campus, condition,
    negotiable, sort = "newest", page = 1, limit = 20
  } = req.query;

  try{

  const cacheKey = `products:${JSON.stringify(req.query)}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return res.status(200).json(JSON.parse(cached));
  } catch (err) {
    console.log("Redis read error:", err.message);
  }

  const query = { isAvailable: true };

  if (category) query.category = category;
  if (subcategory) query.subcategory = subcategory;
  if (campus) query.campus = campus;
  if (condition) query.condition = condition;
  if (negotiable !== undefined) query.negotiable = negotiable === 'true';

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { brand: { $regex: search, $options: "i" } }
    ];
  }

  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = Number(minPrice);
    if (maxPrice) query.price.$lte = Number(maxPrice);
  }

  const sortOptions = {
    "newest": { createdAt: -1 },
    "oldest": { createdAt: 1 },
    "price-asc": { price: 1 },
    "price-desc": { price: -1 },
    "popular": { views: -1 },
    "rating": { rating: -1 }
  };

  const pageNum = Math.max(parseInt(page) || 1, 1);
  const limitNum = Math.min(parseInt(limit) || 20, 50);
  const skip = (pageNum - 1) * limitNum;

  const [products, total] = await Promise.all([
    Product.find(query)
      .populate('vendor', 'name phone')
      .sort(sortOptions[sort] || sortOptions.newest)
      .skip(skip)
      .limit(limitNum)
      .select("-__v"),
    Product.countDocuments(query)
  ]);

  console.log(products)

  const totalPages = Math.ceil(total / limitNum);

  const response = {
    success: true,
    count: products.length,
    total,
    pagination: {
      currentPage: pageNum,
      totalPages,
      limit: limitNum,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1
    },
    data: products
  };

  try {
    await redis.set(cacheKey, JSON.stringify(response), "EX", 600);
  } catch (err) {
    console.log("Redis write error:", err.message);
  }

  res.status(200).json(response);
}catch(err){
  console.log(err)
  res.status(500).json({message:"Internal server error"})
}
});

// @desc    Get single product by ID
// @route   GET /api/products/:id
// @access  Public
const getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate('vendor', '_id name phone rating')
    .populate('reviews.user', 'name avatar');

  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  product.views = (product.views || 0) + 1;
  await product.save();

  const relatedProducts = await Product.find({
    _id: { $ne: product._id },
    category: product.category,
    campus: product.campus,
    isAvailable: true
  })
    .limit(6)
    .select('name images price condition negotiable category')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: { product, relatedProducts }
  });
});

// @desc    Get products by category with optional subcategory filter
// @route   GET /api/products/category/:category
// @access  Public
const getProductsByCategory = asyncHandler(async (req, res) => {
  const { category } = req.params;
  console.log(category)
  console.log("I'm receving request")
  const { subcategory, campus, sort = "newest", page = 1, limit = 20 } = req.query;
  try{

  if (!VALID_CATEGORIES.includes(category)) {
   
    return res.status(400).json({ success: false, message: 'Invalid category', validCategories: VALID_CATEGORIES });
  }

  const cacheKey = `products:category:${category}:${subcategory || 'all'}:${campus || 'all'}:${sort}:${page}:${limit}`;

  /*try {
    const cached = await redis.get(cacheKey);
    if (cached) return res.status(200).json(JSON.parse(cached));
  } catch (err) {
    console.log("Redis read error:", err.message);
  }*/

  const query = { category, isAvailable: true };
  if (subcategory) query.subcategory = subcategory;
  if (campus) query.campus = campus;

  const sortOptions = {
    "newest": { createdAt: -1 },
    "price-asc": { price: 1 },
    "price-desc": { price: -1 },
    "popular": { views: -1 }
  };

  const pageNum = Math.max(parseInt(page) || 1, 1);
  const limitNum = Math.min(parseInt(limit) || 20, 50);
  const skip = (pageNum - 1) * limitNum;
  console.log(query)

  const [products, total] = await Promise.all([
    Product.find(query)
      .populate('vendor', 'name phone')
      .sort(sortOptions[sort] || sortOptions.newest)
      
      .limit(limitNum)
      .select("-__v"),
    Product.countDocuments(query)
  ]);

  const totalPages = Math.ceil(total / limitNum);

  const response = {
    success: true,
    category,
    subcategory: subcategory || null,
    count: products.length,
    total,
    pagination: {
      currentPage: pageNum,
      totalPages,
      limit: limitNum,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1
    },
    data: products
  };

  try {
    await redis.set(cacheKey, JSON.stringify(response), "EX", 600);
  } catch (err) {
    console.log("Redis write error:", err.message);
  }
  console.log(response.data)

  res.status(200).json(response);
}catch(err){
  console.log(err)
  res.status(500).json({message:"Internal server error"})
}

});

// @desc    Get subcategories for a category
// @route   GET /api/products/subcategories/:category
// @access  Public
const getSubcategoriesByCategory = asyncHandler(async (req, res) => {
  const { category } = req.params;

  if (!VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ success: false, message: 'Invalid category' });
  }

  const subcategories = await Product.distinct('subcategory', { category, isAvailable: true });

  res.status(200).json({
    success: true,
    category,
    count: subcategories.length,
    data: subcategories.filter(Boolean)
  });
});

// @desc    Get products by campus
// @route   GET /api/products/campus/:campus
// @access  Public
const getProductsByCampus = asyncHandler(async (req, res) => {
  const { campus } = req.params;
  const { category, subcategory, sort = "newest", page = 1, limit = 20 } = req.query;

  const query = { campus, isAvailable: true };
  if (category) query.category = category;
  if (subcategory) query.subcategory = subcategory;

  const sortOptions = {
    "newest": { createdAt: -1 },
    "price-asc": { price: 1 },
    "price-desc": { price: -1 },
    "popular": { views: -1 }
  };

  const pageNum = Math.max(parseInt(page) || 1, 1);
  const limitNum = Math.min(parseInt(limit) || 20, 50);
  const skip = (pageNum - 1) * limitNum;

  const [products, total] = await Promise.all([
    Product.find(query)
      .populate('vendor', 'name phone')
      .sort(sortOptions[sort] || sortOptions.newest)
      .skip(skip)
      .limit(limitNum)
      .select("-__v"),
    Product.countDocuments(query)
  ]);

  const totalPages = Math.ceil(total / limitNum);

  res.status(200).json({
    success: true,
    campus,
    count: products.length,
    total,
    pagination: {
      currentPage: pageNum,
      totalPages,
      limit: limitNum,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1
    },
    data: products
  });
});

// @desc    Get products by tag
// @route   GET /api/products/tag/:tag
// @access  Public
const getProductsByTag = asyncHandler(async (req, res) => {
  const { tag } = req.params;
  const validTags = ["featured", "urgent-sale", "popular", "discounted", "new-arrival", "student-favorite"];

  if (!validTags.includes(tag)) {
    return res.status(400).json({ success: false, message: 'Invalid tag', validTags });
  }

  const products = await Product.find({ tags: tag, isAvailable: true })
    .populate('vendor', 'name phone')
    .sort({ createdAt: -1 })
    .limit(20)
    .select("-__v");

  res.status(200).json({ success: true, count: products.length, data: products });
});

// @desc    Create product
// @route   POST /api/products
// @access  Private/Vendor
const createProduct = asyncHandler(async (req, res) => {
  try {
    const {
      name, category, subcategory, brand, price, negotiable, condition,
      description, campus, location, tags, countInStock
    } = req.body;

    if (!name || !category || !price || !campus || !location?.campusArea) {
      return res.status(400).json({
        success: false,
        message: 'Name, category, price, campus, and campus area are required'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one product image is required'
      });
    }

    const vendor = await Vendor.findOne({ user: req.user.id });
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor profile not found' });
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: 'Invalid category', validCategories: VALID_CATEGORIES });
    }

    if (subcategory && !VALID_SUBCATEGORIES.includes(subcategory)) {
      return res.status(400).json({ success: false, message: 'Invalid subcategory', validSubcategories: VALID_SUBCATEGORIES });
    }

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      return res.status(400).json({ success: false, message: 'Price must be a valid non-negative number' });
    }

    let slug = generateSlug(name);
    const existingSlug = await Product.findOne({ slug });
    if (existingSlug) slug = `${slug}-${Date.now()}`;

    let images = [];

    try {
      const result = await uploadMultipleProductImages(req.files);
      images = result.map(r => r.url);
    } catch (uploadError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to upload images',
        error: uploadError.message
      });
    }

    const product = await Product.create({
      name,
      slug,
      category,
      subcategory: subcategory || undefined,
      brand: brand || '',
      images,
      price: priceNum,
      negotiable: negotiable === 'true' || negotiable === true,
      condition: condition || 'good',
      description: description || '',
      campus,
      location,
      tags: tags || [],
      countInStock: parseInt(countInStock) || 1,
      vendor: vendor._id,
    });

    vendor.products.push(product._id);
    await vendor.save();

    await invalidateProductCache();

    res.status(201).json({ success: true, message: 'Product listed successfully', data: product });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Vendor (owner)
const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  const vendor = await Vendor.findOne({ user: req.user.id });
  if (!vendor || product.vendor.toString() !== vendor._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized to update this product' });
  }

  const updatableFields = [
    'name', 'category', 'subcategory', 'brand', 'price', 'negotiable', 'condition',
    'description', 'campus', 'location', 'tags', 'countInStock', 'isAvailable'
  ];

  updatableFields.forEach(field => {
    if (req.body[field] !== undefined) {
      product[field] = req.body[field];
    }
  });

  if (req.body.category && !VALID_CATEGORIES.includes(req.body.category)) {
    return res.status(400).json({ success: false, message: 'Invalid category' });
  }

  if (req.body.subcategory && !VALID_SUBCATEGORIES.includes(req.body.subcategory)) {
    return res.status(400).json({ success: false, message: 'Invalid subcategory' });
  }

  if (req.body.name && req.body.name !== product.name) {
    let newSlug = generateSlug(req.body.name);
    const existing = await Product.findOne({ slug: newSlug, _id: { $ne: product._id } });
    if (existing) newSlug = `${newSlug}-${Date.now()}`;
    product.slug = newSlug;
  }

  if (req.files && req.files.length > 0) {
    try {
      if (product.images?.length) {
        await deleteMultipleProductImages(product.images);
      }

      const result = await uploadMultipleProductImages(req.files);
      product.images = result.map(r => r.url);
    } catch (uploadError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to upload new images',
        error: uploadError.message
      });
    }
  }

  await product.save();
  await invalidateProductCache();

  res.status(200).json({ success: true, message: 'Product updated', data: product });
});

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private/Vendor (owner) or Admin
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  const vendor = await Vendor.findOne({ user: req.user.id });

  if (!vendor || product.vendor.toString() !== vendor._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }

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
  await invalidateProductCache();

  res.status(200).json({ success: true, message: 'Product deleted' });
});

// @desc    Search products
// @route   GET /api/products/search/:query
// @access  Public
const searchProducts = asyncHandler(async (req, res) => {
  const { query } = req.params;
  const { campus, category, subcategory, limit = 15 } = req.query;

  if (!query || query.trim().length < 2) {
    return res.status(400).json({ success: false, message: 'Search query must be at least 2 characters' });
  }

  const searchQuery = {
    isAvailable: true,
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { description: { $regex: query, $options: 'i' } },
      { brand: { $regex: query, $options: 'i' } },
      { category: { $regex: query, $options: 'i' } }
    ]
  };

  if (campus) searchQuery.campus = campus;
  if (category) searchQuery.category = category;
  if (subcategory) searchQuery.subcategory = subcategory;

  const products = await Product.find(searchQuery)
    .populate('vendor', 'name phone')
    .limit(parseInt(limit))
    .select('name images price condition campus category subcategory')
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, query, count: products.length, data: products });
});

// @desc    Add/update product review
// @route   POST /api/products/:id/review
// @access  Private
const createProductReview = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;
  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
  }

  const alreadyReviewed = product.reviews.find(
    r => r.user.toString() === req.user.id
  );

  if (alreadyReviewed) {
    alreadyReviewed.rating = rating;
    alreadyReviewed.comment = comment || alreadyReviewed.comment;
  } else {
    product.reviews.push({
      user: req.user.id,
      name: req.user.name,
      rating,
      comment: comment || ''
    });
    product.numReviews = product.reviews.length;
  }

  product.rating = product.reviews.reduce((acc, r) => acc + r.rating, 0) / product.reviews.length;

  await product.save();

  res.status(200).json({ success: true, message: 'Review saved', rating: product.rating, numReviews: product.numReviews });
});

// @desc    Toggle favorite product
// @route   POST /api/products/:id/favorite
// @access  Private
const toggleFavorite = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  product.favorites = (product.favorites || 0) + 1;
  await product.save();

  res.status(200).json({ success: true, favorites: product.favorites });
});

// @desc    Get product stats
// @route   GET /api/products/stats
// @access  Public
const getProductStats = asyncHandler(async (req, res) => {
  const [totalProducts, campusStats, categoryStats, conditionStats] = await Promise.all([
    Product.countDocuments({ isAvailable: true }),
    Product.aggregate([
      { $match: { isAvailable: true } },
      { $group: { _id: '$campus', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    Product.aggregate([
      { $match: { isAvailable: true } },
      { $group: { _id: '$category', count: { $sum: 1 }, avgPrice: { $avg: '$price' } } },
      { $sort: { count: -1 } }
    ]),
    Product.aggregate([
      { $match: { isAvailable: true } },
      { $group: { _id: '$condition', count: { $sum: 1 } } }
    ])
  ]);

  res.status(200).json({
    success: true,
    totalProducts,
    byCampus: campusStats,
    byCategory: categoryStats,
    byCondition: conditionStats
  });
});

module.exports = {
  getAllProducts,
  getProductById,
  getProductsByCategory,
  getSubcategoriesByCategory,
  getProductsByCampus,
  getProductsByTag,
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
  createProductReview,
  toggleFavorite,
  getProductStats
};
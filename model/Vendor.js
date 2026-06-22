const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },

  name: {
    type: String,
    required: true,
    trim: true,
  },

  storeName: {
    type: String,
    trim: true,
  },

  campus: {
    type: String,
    enum: [
      'UG',
      'KNUST',
      'UCC',
      'UEW',
      'UPSA',
      'GIMPA',
      'ASHESI',
      'ATU',
      'OTHER',
    ],
    index: true,
  },

  location: {
    campusArea: {
      type: String,
    },
    hostel: {
      type: String,
    },
  },

  phone: {
    type: String,
    required: true,
    unique: true,
  },

  storeBanner: {
    type: String,
    default: 'default_banner.jpg',
  },

  storeBannerCloudinaryId: {
    type: String,
  },

  profileImage: {
    type: String,
    default: 'default_profile.jpg',
  },

  profileImageCloudinaryId: {
    type: String,
  },

  products: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
  }],

  categories: [{
    type: String,
    enum: [
      'electronics',
      'phones and tablets',
      'computers and laptops',
      'gaming',
      'fashion',
      'books-course-materials',
      'hostel-items',
      'appliances',
      'furniture',
      'beauty and grooming',
      'sports and fitness',
      'accessories',
      'food and drinks',
      'services',
      'other',
    ],
  }],

  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5,
  },

  numReviews: {
    type: Number,
    default: 0,
  },

  totalSales: {
    type: Number,
    default: 0,
  },

  isVerified: {
    type: Boolean,
    default: false,
  },

  isActive: {
    type: Boolean,
    default: true,
  },

  bio: {
    type: String,
    maxlength: 1000,
  },

  socialLinks: {
    whatsapp: { type: String },
    instagram: { type: String },
  },
}, {
  timestamps: true,
});

vendorSchema.index({ campus: 1, isActive: 1 });
vendorSchema.index({ categories: 1 });

vendorSchema.virtual('productCount').get(function () {
  return this.products?.length || 0;
});

vendorSchema.set('toJSON', { virtuals: true });
vendorSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Vendor', vendorSchema);
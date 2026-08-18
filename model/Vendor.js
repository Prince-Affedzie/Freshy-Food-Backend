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

  //  NEW: distinguishes a shop that sells products from a business that
  // sells a service (tutor, braider, laptop repair, photographer, etc).
  // The frontend uses this to decide whether to show a product catalog +
  // "Add to cart" flow, or a bio + "Message business" flow.
  businessType: {
    type: String,
    enum: ['product', 'service', 'both'],
    default: 'product',
    index: true,
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
      //  NEW: additive only — existing vendor documents and the old
      // Discover-screen category chips keep working unchanged.
      'tutoring-education',
      'photography-media',
      'graphic-design-printing',
      'repair-services',
      'events-catering',
      'accommodation-housing',
      'other',
    ],
  }],

  //  NEW: free-text discovery keywords the vendor can attach to their
  // profile — "barber", "braids", "iphone screen repair", "wedding photos".
  // This is what makes search work for the long tail of service queries
  // in the business-discovery vision without needing a new enum value
  // (and a data migration) every time a new kind of business signs up.
  searchTags: [{
    type: String,
    trim: true,
    lowercase: true,
  }],

  //  NEW: simple human-readable hours, e.g. "Mon-Fri 9am-6pm".
  // Kept as free text rather than a structured schedule to stay a "small"
  // addition — revisit as a structured sub-doc later if you need
  // open-now filtering.
  openingHours: {
    type: String,
    trim: true,
    maxlength: 200,
  },

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

  //  NEW: placeholder for the premium "Featured business" tier
  // mentioned in the discovery plan. No ranking logic wired up yet —
  // just the field, so there's no future migration needed to add it.
  isFeatured: {
    type: Boolean,
    default: false,
    index: true,
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
vendorSchema.index({ businessType: 1, isActive: 1 });
vendorSchema.index({ searchTags: 1 });

//  NEW: weighted text index — name matches rank above storeName matches,
// which rank above tag matches, which rank above bio matches. Lets the
// controller use MongoDB's relevance scoring ($text + $meta:"textScore")
// instead of only ever getting unranked regex hits.
vendorSchema.index(
  { name: 'text', storeName: 'text', searchTags: 'text', bio: 'text' },
  {
    weights: { name: 10, storeName: 8, searchTags: 5, bio: 2 },
    name: 'VendorSearchIndex',
  }
);

vendorSchema.virtual('productCount').get(function () {
  return this.products?.length || 0;
});

vendorSchema.set('toJSON', { virtuals: true });
vendorSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Vendor', vendorSchema);
const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },

    category: {
      type: String,
      required: true,
      enum: [
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
        "tickets and events",
        'transport and logistics',
        "services",
        "groceries",
        "other",
      ],
    },

    subcategory: {
      type: String,
    },

    brand: {
      type: String,
    },

    images: [
      {
        type: String,
        required: true,
      },
    ],

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    negotiable: {
      type: Boolean,
      default: false,
    },

    condition: {
      type: String,
      enum: [
        "new",
        "like-new",
        "excellent",
        "good",
        "fair",
        "slightly-used",
        "for-parts",
      ],
      default: "good",
    },

    description: {
      type: String,
      maxlength: 2000,
    },


    specifications: {
      type: Map,
      of: String,
      default: {}
    },

    variations: [{
      type: {
        type: String, // e.g., "Size", "Color", "Flavor"
      },
      options: [{
        name: String, // e.g., "Large", "Red", "Chocolate"
        price: Number,
        countInStock: Number,
        sku: String,
      }],
    }],


    discountInfo: {
      originalPrice: {
        type: Number,
      },
      discountPercentage: {
        type: Number,
        min: 0,
        max: 100,
      },
      discountStartDate: {
        type: Date,
      },
      discountEndDate: {
        type: Date,
      },
      isOnSale: {
        type: Boolean,
        default: false,
      },
      couponEligible: {
        type: Boolean,
        default: true,
      },
    },

    campus: {
      type: String,
      required: true,
      enum: [
        "UG",
        "KNUST",
        "UCC",
        "UEW",
        "UPSA",
        "GIMPA",
        "ASHESI",
        "ATU",
        "OTHER",
      ],
    },

    location: {
      campusArea: {
        type: String,
        required: false,
      },
      hostel: {
        type: String,
      },
    },

    tags: [
      {
        type: String,
        enum: [
          "featured",
          "urgent-sale",
          "popular",
          "discounted",
          "new-arrival",
          "student-favorite",
        ],
      },
    ],

    countInStock: {
      type: Number,
      default: 1,
    },

    isAvailable: {
      type: Boolean,
      default: true,
    },

    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },

    views: {
      type: Number,
      default: 0,
    },

    favorites: {
      type: Number,
      default: 0,
    },

   
    reviews: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
        rating: {
          type: Number,
          required: true,
          min: 1,
          max: 5,
        },
        comment: {
          type: String,
          trim: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    numReviews: {
      type: Number,
      default: 0,
    },

    rating: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

productSchema.index({ category: 1, subcategory: 1 });
productSchema.index({ campus: 1, category: 1 });
productSchema.index({ name: 'text', description: 'text', brand: 'text' });

module.exports = mongoose.model("Product", productSchema);
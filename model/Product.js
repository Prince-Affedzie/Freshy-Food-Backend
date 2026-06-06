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
        "services",
        "other",
      ],
    },

    subcategory: {
      type: String,
      enum: [
        // Electronics
        "headphones-earbuds",
        "speakers",
        "chargers-cables",
        "power-banks",
        "smartwatches",
        "cameras",
        "other-electronics",
        // Phones & Tablets
        "smartphones",
        "tablets",
        "ipads",
        "phone-cases",
        "screen-protectors",
        "other-phone-accessories",
        // Computers & Laptops
        "laptops",
        "desktops",
        "monitors",
        "keyboards",
        "mouse",
        "laptop-bags",
        "software",
        "other-computer-accessories",
        // Gaming
        "consoles",
        "games",
        "controllers",
        "gaming-accessories",
        // Fashion
        "men-clothing",
        "women-clothing",
        "unisex-clothing",
        "shoes",
        "bags",
        "watches",
        "jewelry",
        "other-fashion",
        // Books & Course Materials
        "textbooks",
        "course-notes",
        "past-questions",
        "stationery",
        "novels",
        "other-books",
        // Hostel Items
        "bedding",
        "kitchenware",
        "cleaning-supplies",
        "storage",
        "lighting",
        "other-hostel",
        // Appliances
        "fans",
        "heaters",
        "irons",
        "kettles",
        "blenders",
        "microwaves",
        "other-appliances",
        // Furniture
        "chairs",
        "tables-desks",
        "beds-mattresses",
        "shelves",
        "other-furniture",
        // Beauty & Grooming
        "skincare",
        "makeup",
        "hair-care",
        "perfumes",
        "nail-care",
        "other-beauty",
        // Sports & Fitness
        "sports-equipment",
        "gym-gear",
        "activewear",
        "other-sports",
        // Accessories
        "phone-accessories",
        "laptop-accessories",
        "fashion-accessories",
        "other-accessories",
        // Food & Drinks
        "snacks",
        "drinks",
        "homemade-meals",
        "baked-goods",
        "other-food",
        // Services
        "tutoring",
        "graphic-design",
        "photography",
        "printing-photocopy",
        "laundry",
        "barbering-hairdressing",
        "tech-repairs",
        "other-services",
        // Other
        "miscellaneous",
      ],
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
        required: true,
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
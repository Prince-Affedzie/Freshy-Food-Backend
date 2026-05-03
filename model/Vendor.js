const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  user:{
    type: mongoose.Schema.Types.ObjectId,
    ref:'User'
  },
  name: {
    type: String,
    required: true,
    trim: true // Cleans up accidental whitespace
  },
  market_name: { 
    type: String,
    required: true, 
    index: true ,
    enum:['Madina Market','Mallam Market','Makola Market','Tema Market','Dansoman Market','Agbogbloshie Market','Kaneshie Market','Dome Market']
  },
  store_banner: {
    type: String,
    default: 'default_banner.jpg'
  },
  profile_image: {
    type: String,
    default: 'default_profile.jpg'
  },
  profile_image_cloudinaryId:{
    type: String,
  },
  store_banner_cloudinaryId:{
    type:String
  },
  contact: {
    type: String,
    required: true 
  },
  location: {
    type: String, 
    required: true
  },
  
  products: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],

  is_verified: {
    type: Boolean,
    default: false 
  }
}, { timestamps: true }); 

module.exports = mongoose.model('Vendor', vendorSchema);
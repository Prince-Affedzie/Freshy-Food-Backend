const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
 firstName: { type: String, required: true },
 lastName:{ type: String, required: true },
 email: { type: String, unique: true },
  password: { type: String,default:null }, 
  phone: { type: String, required: true }, 
  isAdmin: { type: Boolean, default: false, required: true },
  role:{type:String},
  address: { type: String, default: '' },
  city: { type: String, default: '' },
  nearestLandmark: { type: String, default: '' } 
}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);
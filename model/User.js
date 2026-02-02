const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
 firstName: { type: String, required: true },
 lastName:{ type: String, },
 email: { 
  type: String, 
  unique: true, 
  sparse: true, // This allows multiple "null/undefined" entries
  lowercase: true, 
  trim: true // Recommended to prevent " user@email.com" issues
},
 password: { type: String,default:null }, 
 phone: { type: String, unique: true }, 
 isAdmin: { type: Boolean, default: false, required: true },
 role:{type:String ,default:'customer'},
 address: { type: String, default: '' },
 city: { type: String, default: '' },
 nearestLandmark: { type: String, default: '' } ,
 cartItems:[
   {
    product:{
      type:mongoose.Schema.Types.ObjectId,
      ref:'Product'
    },
    quantity:{type:Number}
   }
 ],
 favorites:[
  {
    product:{
      type:mongoose.Schema.Types.ObjectId,
      ref:'Product'
    }
  }
 ],
 orders:[
  {
  orderId:{
   type:mongoose.Schema.Types.ObjectId,
    ref:'Order'
  }
  }
 ],

 pushToken:{
  type:String
 },

}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);
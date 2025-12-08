const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.My_Cloudinary_Name,
  api_key: process.env.My_Cloudinary_API_Key,
  api_secret:process.env.My_Cloudinary_API_Secret,
});

module.exports = cloudinary;

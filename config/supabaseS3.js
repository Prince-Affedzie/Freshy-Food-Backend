const { createClient } = require('@supabase/supabase-js')

// Initialize Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const uploadProductImage = async (file) => {
  // 1. Keep the original extension (jpg, png, etc.)
  const fileExt = file.originalname.split('.').pop();
  const fileName = `products/${Date.now()}-${Math.floor(Math.random() * 1000)}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from('FreshyFoodFactory')
    .upload(fileName, file.buffer, {
      contentType: file.mimetype, // Use actual mimetype from multer
      cacheControl: '3600',
      upsert: false 
    });

  if (error) throw error;

  const { data: publicUrlData } = supabase.storage
    .from('FreshyFoodFactory')
    .getPublicUrl(fileName);

  return publicUrlData.publicUrl; 
};


const deleteProductImage = async (fullUrl) => {
  try {
    if (!fullUrl) return;

    // Extract the path after the bucket name
    // Example: https://xyz.supabase.co/storage/v1/object/public/FreshyFoodFactory/products/123.png
    // We need: "products/123.png"
    const path = fullUrl.split('FreshyFoodFactory/')[1];

    if (path) {
      const { error } = await supabase.storage
        .from('FreshyFoodFactory')
        .remove([path]); // .remove() expects an array of paths

      if (error) {
        console.error('Supabase deletion error:', error.message);
      }
    }
  } catch (err) {
    console.error('Error parsing URL for deletion:', err);
  }
};

module.exports = { uploadProductImage, deleteProductImage };


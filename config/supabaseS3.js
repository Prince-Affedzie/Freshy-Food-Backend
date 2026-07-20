const { createClient } = require("@supabase/supabase-js");
const sharp = require("sharp");


const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// -------------------------------
// UPLOAD SINGLE IMAGE (CORE)
// -------------------------------

const uploadProductImage = async (file) => {
  const compressedBuffer = await sharp(file.buffer)
    .resize({
      width: 1200,
      withoutEnlargement: true,
    })
    .webp({
      quality: 75,
    })
    .toBuffer();

  const fileName = `products/${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 10)}.webp`;

  const { error } = await supabase.storage
    .from("FreshyFoodFactory")
    .upload(fileName, compressedBuffer, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from("FreshyFoodFactory")
    .getPublicUrl(fileName);

  return {
    url: data.publicUrl,
    path: fileName,
  };
};

// -------------------------------
// UPLOAD MULTIPLE IMAGES
// -------------------------------
const uploadMultipleProductImages = async (files = []) => {
  if (!files.length) return [];

  const uploadPromises = files.map((file) =>
    uploadProductImage(file)
  );

  return Promise.all(uploadPromises);
};

// -------------------------------
// SAFE PATH EXTRACTOR
// -------------------------------
const extractPathFromUrl = (fullUrl) => {
  try {
    const bucketPart = "FreshyFoodFactory/";

    if (!fullUrl.includes(bucketPart)) return null;

    return fullUrl.split(bucketPart)[1];
  } catch (err) {
    console.error("URL parsing error:", err);
    return null;
  }
};

// -------------------------------
// DELETE SINGLE IMAGE
// -------------------------------
const deleteProductImage = async (fullUrl) => {
  try {
    if (!fullUrl) return;

    const path = extractPathFromUrl(fullUrl);
    if (!path) return;

    const { error } = await supabase.storage
      .from("FreshyFoodFactory")
      .remove([path]);

    if (error) {
      console.error("Supabase deletion error:", error.message);
    }
  } catch (err) {
    console.error("Delete error:", err);
  }
};

// -------------------------------
// DELETE MULTIPLE IMAGES
// -------------------------------
const deleteMultipleProductImages = async (urls = []) => {
  try {
    if (!urls.length) return;

    const paths = urls
      .map(extractPathFromUrl)
      .filter(Boolean);

    if (!paths.length) return;

    const { error } = await supabase.storage
      .from("FreshyFoodFactory")
      .remove(paths);

    if (error) {
      console.error("Batch delete error:", error.message);
    }
  } catch (err) {
    console.error("Batch delete error:", err);
  }
};

module.exports = {
  uploadProductImage,
  uploadMultipleProductImages,
  deleteProductImage,
  deleteMultipleProductImages,
};
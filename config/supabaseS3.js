const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// -------------------------------
// UPLOAD SINGLE IMAGE (CORE)
// -------------------------------
const uploadProductImage = async (file) => {
  const fileExt = file.originalname.split(".").pop();

  const fileName = `products/${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 10)}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from("FreshyFoodFactory")
    .upload(fileName, file.buffer, {
      contentType: file.mimetype,
      cacheControl: "3600",
      upsert: false,
    });

  if (error) throw error;

  const { data: publicUrlData } = supabase.storage
    .from("FreshyFoodFactory")
    .getPublicUrl(fileName);

  return {
    url: publicUrlData.publicUrl,
    path: fileName, // IMPORTANT for deletion later
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
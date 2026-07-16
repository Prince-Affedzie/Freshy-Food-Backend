function buildMongoQuery(intent) {
  const filter = { countInStock: { $gt: 0 } };

  if (intent.category && intent.category !== "none") {
    filter.category = intent.category;
  }
  if (intent.subcategory) {
    filter.subcategory = intent.subcategory;
  }
  if (intent.condition && intent.condition !== "none") {
    filter.condition = intent.condition;
  }
  if (intent.negotiableOnly) {
    filter.negotiable = true;
  }
  if (intent.priceMin != null || intent.priceMax != null) {
    filter.price = {};
    if (intent.priceMin != null) filter.price.$gte = intent.priceMin;
    if (intent.priceMax != null) filter.price.$lte = intent.priceMax;
  }
  if (intent.keywords?.length > 0) {
    filter.$text = { $search: intent.keywords.join(" ") };
  }

  return filter;
}

module.exports = buildMongoQuery;
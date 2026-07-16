function rankResults(products, intent) {
  const now = Date.now();

  // Extract search keywords from the user's intent query (e.g., "shoe", "nice shoe")
  const queryTerms = intent.query 
    ? intent.query.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/) 
    : [];

  return products
    .map((p) => {
      let score = 0;
      const productName = p.name ? p.name.toLowerCase() : "";
      const subcategory = p.subcategory ? p.subcategory.toLowerCase() : "";
      const category = p.category ? p.category.toLowerCase() : "";
      const description = p.description ? p.description.toLowerCase() : "";

      // ==========================================
      // 1. TEXT RELEVANCY BOOST (Highest Weight)
      // ==========================================
      let matchScore = 0;
      queryTerms.forEach((term) => {
        // Skip tiny filler words like "a", "to", "for"
        if (term.length <= 2) return; 

        if (productName.includes(term)) {
          matchScore += 80; // High reward for name matches
        }
        if (subcategory.includes(term)) {
          matchScore += 60; // Medium-high reward for subcategory matches
        }
        if (category.includes(term)) {
          matchScore += 20; // Slight reward for general category
        }
        if (description.includes(term)) {
          matchScore += 10; // Small reward for description matches
        }
      });

      // If the query was explicit but this product didn't match any key terms, 
      // we heavily penalize it so it sinks to the bottom.
      if (queryTerms.length > 0 && matchScore === 0) {
        score -= 150; 
      } else {
        score += matchScore;
      }

      // ==========================================
      // 2. BUDGET / PRICE SWEET SPOT
      // ==========================================
      if (intent.priceMax) {
        const sweetSpot = intent.priceMax * 0.85;
        const diff = Math.abs(p.price - sweetSpot);
        score += Math.max(0, 100 - diff / 10);
      }

      // ==========================================
      // 3. CONDITION & RECENCY
      // ==========================================
      if (["new", "like-new"].includes(p.condition)) score += 10;

      // Recency boost, decaying over 20 days
      //const ageDays = (now - new Date(p.createdAt).getTime()) / 86400000;
      //score += Math.max(0, 20 - ageDays);

      // Save the calculated score
      return { ...p, _score: score };
    })
    // Sort descending (highest score first)
    .sort((a, b) => b._score - a._score);
}

module.exports = rankResults;
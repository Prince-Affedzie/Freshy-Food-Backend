function rankResults(products, intent) {
  const now = Date.now();

  // 1. FALLBACK to searchTerm if intent.query is empty
  const searchQuery = intent.query || intent.searchTerm || "";
  const queryTerms = searchQuery 
    ? searchQuery.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/) 
    : [];

  return products
    .map((p) => {
      let score = 0;
      const productName = p.name ? p.name.toLowerCase() : "";
      const subcategory = p.subcategory ? p.subcategory.toLowerCase() : "";
      const category = p.category ? p.category.toLowerCase() : "";
      const description = p.description ? p.description.toLowerCase() : "";
      const brand = p.brand ? p.brand.toLowerCase() : "";

      // ==========================================
      // 1. TEXT RELEVANCY BOOST
      // ==========================================
      let matchScore = 0;
      queryTerms.forEach((term) => {
        if (term.length <= 1) return; // Skip single characters

        let termMatched = false;

        if (productName.includes(term)) {
          matchScore += 80;
          termMatched = true;
        }
        if (subcategory.includes(term)) {
          matchScore += 60;
          termMatched = true;
        }
        if (category.includes(term)) {
          matchScore += 20;
          termMatched = true;
        }
        if (description.includes(term)) {
          matchScore += 10;
          termMatched = true;
        }
        // Brand Match (e.g., matching "iphone" queries to "Apple" brand products)
        if (brand.includes(term) || (term === 'iphone' && brand === 'apple')) {
          matchScore += 40;
          termMatched = true;
        }
      });

      // If the user searched for something specific but this item has 0 match score
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
        // Safely add bonus; ensure it never subtracts below 0
        const budgetBonus = Math.max(0, 100 - (diff / 10));
        score += budgetBonus;
      }

      // ==========================================
      // 3. CONDITION & RECENCY
      // ==========================================
      if (["new", "like-new"].includes(p.condition)) score += 10;

      return { ...p, _score: score };
    })
    .sort((a, b) => b._score - a._score);
}

module.exports = rankResults;

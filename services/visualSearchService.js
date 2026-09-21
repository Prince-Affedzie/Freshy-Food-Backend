// services/visualSearchService.js
const ai = require("../config/gemini");
const { Type } = require("@google/genai");
const { CATEGORIES, SUBCATEGORIES } = require("../schemas/searchIntentSchema");

const MODEL_NAME = process.env.AI_SEARCH_MODEL || "gemini-2.5-flash";

function bufferToGenerativePart(buffer, mimeType) {
  return {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType,
    },
  };
}

/**
 * Step 1: Analyzes an image uploaded by a customer looking for a match
 * and converts it into structured search parameters for CediMart DB.
 */
async function extractSearchIntentFromImage(imageBuffer, mimeType, optionalUserText = "") {
  const imagePart = bufferToGenerativePart(imageBuffer, mimeType);

  const prompt = `
    Analyze this product photo uploaded by a customer who is looking to buy something similar on our  marketplace.
    ${optionalUserText ? `Additional customer request: "${optionalUserText}"` : ""}

    Your task is to identify key visual features, brand/style indicators, item type, and primary search keywords, then output structured search parameters.

    CONFINEMENT RULES:
    1. "category": Choose exactly one valid string from the allowed categories list, or "none" if unsure.
    2. "subcategory": Choose exactly one matched subcategory string from the allowed list, or "none" if unsure.
    3. "searchTerm": A rich, descriptive search query (e.g. "standing rechargeable fan silver", "white nike sneakers low top").
    4. "detectedItem": A concise 2-4 word description of what you saw in the photo for summary purposes (e.g., "White Standing Fan").

    Allowed CATEGORIES:
    ${JSON.stringify(CATEGORIES)}

    Allowed SUBCATEGORIES:
    ${JSON.stringify(SUBCATEGORIES)}
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }, imagePart],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedItem: { type: Type.STRING },
            searchTerm: { type: Type.STRING },
            category: { type: Type.STRING },
            subcategory: { type: Type.STRING },
            colorOrStyleKeywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ["detectedItem", "searchTerm", "category", "subcategory"],
        },
      },
    });

    return JSON.parse(response.text.trim());
  } catch (error) {
    console.error("Error extracting search intent from image:", error);
    throw error;
  }
}

module.exports = { extractSearchIntentFromImage };
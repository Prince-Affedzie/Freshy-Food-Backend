const fs = require("fs");
const ai = require("../config/gemini");


function bufferToGenerativePart(buffer, mimeType) {
  return {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType
    },
  };
}


async function generateProductDetails(imageBuffer, mimeType) {
  const imagePart = bufferToGenerativePart(imageBuffer, mimeType);

  const prompt = `
    Analyze this product image uploaded by a student vendor on our campus marketplace.
    Generate a JSON response containing:
    1. "name": A catchy, professional product title (max 60 characters).
    2. "description": A detailed description highlighting features, materials, and use-cases.
    3. "suggestedCategory": Choose exactly one string key from the allowed list.
    4. "suggestedSubcategory": Choose exactly one matched subcategory string key from the mapping below.
    5. "tags": An array of 3-5 keywords.

    === CONFINEMENT RULES ===
    Allowed "suggestedCategory" keys:
    electronics, phones and tablets, computers and laptops, gaming, fashion, books-course-materials, hostel-items, appliances, furniture, beauty and grooming, sports and fitness, accessories, food and drinks, tickets and events, transport and logistics, services, other

    Allowed "suggestedSubcategory" keys based on chosen category:
    * electronics: headphones-earbuds, speakers, chargers-cables, power-banks, smartwatches, cameras, projectors, calculators-scientific, extensions-plugs, trimmers-clippers, other-electronics
    * phones and tablets: smartphones, tablets, ipads, phone-cases, screen-protectors, tripods-gimbals, memory-cards, other-phone-accessories
    * computers and laptops: laptops, desktops, monitors, keyboards, mouse, laptop-bags, hard-drives-ssds, usb-flash-drives, software, other-computer-accessories
    * gaming: consoles, games, controllers, gaming-headsets, gaming-accessories
    * fashion: men-clothing, women-clothing, unisex-clothing, sneakers-footwear, traditional-wear, thrift-bend-down, bags, watches-jewelry, caps-hats, other-fashion
    * books-course-materials: textbooks, course-notes, past-questions, stationery, lab-coats-equipment, drawing-instruments, novels-literature, other-books
    * hostel-items: bedding-mattresses, gas-cylinders-stoves, kitchenware, buckets-containers, cleaning-supplies, storage-wardrobes, lighting-lamps, mirrors, curtains-mats, other-hostel
    * appliances: fans, refrigerators, kettles, blenders, irons, microwaves, rice-cookers, other-appliances
    * furniture: chairs-stools, tables-desks, beds-frames, shelves-racks, other-furniture
    * beauty and grooming: skincare, makeup, hair-care-wigs, perfumes-sprays, nail-care, clippers-shavers, other-beauty
    * sports and fitness: sports-equipment, gym-gear, activewear, water-bottles, other-sports
    * accessories: wallets-cardholders, belts, sunglasses, keychains-lanyards, other-accessories
    * food and drinks: provisions, snacks, drinks, breakfast-packs, homemade-meals, baked-goods, night-bites, spices-raw-food, other-food
    * tickets and events: concerts-shows, campus-dinners, bus-trips, seminars-webinars, other-tickets
    * transport and logistics: bicycles, scooters, campus-delivery, luggage-moving, other-transport
    * services: tutoring, graphic-design, photography, printing-photocopy, laundry, barbering-hairdressing, tech-repairs, tailoring-alterations, other-services
    * other: miscellaneous
  `;

  try {
    const response = await ai.models.generateContent({
      model: process.env.AI_AGENT_MODE,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            imagePart
          ]
        }
      ],
      config: {
        responseMimeType: "application/json" 
      }
    });

    return JSON.parse(response.text.trim());
  } catch (error) {
    console.error("Error generating product details:", error);
    throw error;
  }
}

module.exports = { generateProductDetails };
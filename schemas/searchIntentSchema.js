// schemas/searchIntentSchema.js
const { z } = require("zod");

const CATEGORIES = [
  "electronics", "phones and tablets", "computers and laptops", "gaming",
  "fashion", "books-course-materials", "hostel-items", "appliances",
  "furniture", "beauty and grooming", "sports and fitness", "accessories",
  "food and drinks", "services", "other",
];

// Your structured subcategory map
const SUBCATEGORIES_MAP = {
  'electronics': [
    { id: 'headphones-earbuds', label: 'Headphones & Earbuds' },
    { id: 'speakers',           label: 'Speakers' },
    { id: 'chargers-cables',    label: 'Chargers & Cables' },
    { id: 'power-banks',        label: 'Power Banks' },
    { id: 'smartwatches',       label: 'Smartwatches' },
    { id: 'cameras',            label: 'Cameras' },
    { id: 'other-electronics',  label: 'Other Electronics' },
  ],
  'phones and tablets': [
    { id: 'smartphones',              label: 'Smartphones' },
    { id: 'tablets',                  label: 'Tablets' },
    { id: 'ipads',                    label: 'iPads' },
    { id: 'phone-cases',              label: 'Phone Cases' },
    { id: 'screen-protectors',        label: 'Screen Protectors' },
    { id: 'other-phone-accessories',  label: 'Other Accessories' },
  ],
  'computers and laptops': [
    { id: 'laptops',                    label: 'Laptops' },
    { id: 'desktops',                   label: 'Desktops' },
    { id: 'monitors',                   label: 'Monitors' },
    { id: 'keyboards',                  label: 'Keyboards' },
    { id: 'mouse',                      label: 'Mouse' },
    { id: 'laptop-bags',                label: 'Laptop Bags' },
    { id: 'software',                   label: 'Software' },
    { id: 'other-computer-accessories', label: 'Other' },
  ],
  'gaming': [
    { id: 'consoles',           label: 'Consoles' },
    { id: 'games',              label: 'Games' },
    { id: 'controllers',        label: 'Controllers' },
    { id: 'gaming-accessories', label: 'Accessories' },
  ],
  'fashion': [
    { id: 'men-clothing',    label: "Men's Clothing" },
    { id: 'women-clothing',  label: "Women's Clothing" },
    { id: 'unisex-clothing', label: 'Unisex Clothing' },
    { id: 'shoes',           label: 'Shoes' },
    { id: 'bags',            label: 'Bags' },
    { id: 'watches',         label: 'Watches' },
    { id: 'jewelry',         label: 'Jewelry' },
    { id: 'other-fashion',   label: 'Other Fashion' },
  ],
  'books-course-materials': [
    { id: 'textbooks',      label: 'Textbooks' },
    { id: 'course-notes',   label: 'Course Notes' },
    { id: 'past-questions', label: 'Past Questions' },
    { id: 'stationery',     label: 'Stationery' },
    { id: 'novels',         label: 'Novels' },
    { id: 'other-books',    label: 'Other Books' },
  ],
  'hostel-items': [
    { id: 'bedding',          label: 'Bedding' },
    { id: 'kitchenware',      label: 'Kitchenware' },
    { id: 'cleaning-supplies',label: 'Cleaning Supplies' },
    { id: 'storage',          label: 'Storage' },
    { id: 'lighting',         label: 'Lighting' },
    { id: 'other-hostel',     label: 'Other' },
  ],
  'appliances': [
    { id: 'fans',             label: 'Fans' },
    { id: 'heaters',          label: 'Heaters' },
    { id: 'irons',            label: 'Irons' },
    { id: 'kettles',          label: 'Kettles' },
    { id: 'blenders',         label: 'Blenders' },
    { id: 'microwaves',       label: 'Microwaves' },
    { id: 'other-appliances', label: 'Other' },
  ],
  'furniture': [
    { id: 'chairs',          label: 'Chairs' },
    { id: 'tables-desks',    label: 'Tables & Desks' },
    { id: 'beds-mattresses', label: 'Beds & Mattresses' },
    { id: 'shelves',         label: 'Shelves' },
    { id: 'other-furniture', label: 'Other' },
  ],
  'beauty and grooming': [
    { id: 'skincare',      label: 'Skincare' },
    { id: 'makeup',        label: 'Makeup' },
    { id: 'hair-care',     label: 'Hair Care' },
    { id: 'perfumes',      label: 'Perfumes' },
    { id: 'nail-care',     label: 'Nail Care' },
    { id: 'other-beauty',  label: 'Other' },
  ],
  'sports and fitness': [
    { id: 'sports-equipment', label: 'Sports Equipment' },
    { id: 'gym-gear',          label: 'Gym Gear' },
    { id: 'activewear',        label: 'Activewear' },
    { id: 'other-sports',      label: 'Other' },
  ],
  'accessories': [
    { id: 'phone-accessories',   label: 'Phone Accessories' },
    { id: 'laptop-accessories',  label: 'Laptop Accessories' },
    { id: 'fashion-accessories', label: 'Fashion Accessories' },
    { id: 'other-accessories',   label: 'Other' },
  ],
  'food and drinks': [
    { id: 'snacks',        label: 'Snacks' },
    { id: 'drinks',        label: 'Drinks' },
    { id: 'homemade-meals',label: 'Homemade Meals' },
    { id: 'baked-goods',   label: 'Baked Goods' },
    { id: 'other-food',    label: 'Other Food' },
  ],
  'services': [
    { id: 'tutoring',                label: 'Tutoring' },
    { id: 'graphic-design',          label: 'Graphic Design' },
    { id: 'photography',             label: 'Photography' },
    { id: 'printing-photocopy',      label: 'Printing & Photocopy' },
    { id: 'laundry',                 label: 'Laundry' },
    { id: 'barbering-hairdressing',  label: 'Barbing & Hairdressing' },
    { id: 'tech-repairs',            label: 'Tech Repairs' },
    { id: 'other-services',          label: 'Other Services' },
  ],
  'other': [
    { id: 'miscellaneous', label: 'Miscellaneous' },
  ],
};

// Programmatically extract all unique subcategory IDs into a flat array
const SUBCATEGORIES = Object.values(SUBCATEGORIES_MAP)
  .flat()
  .map(item => item.id);

const CONDITIONS = [
  "new", "like-new", "excellent", "good", "fair", "slightly-used", "for-parts",
];

// Zod validation schema definition
const SearchIntentSchema = z.object({
  category: z.enum([...CATEGORIES, "none"]),
  subcategory: z.enum([...SUBCATEGORIES, "none"]),
  priceMin: z.number().nullable(),
  priceMax: z.number().nullable(),
  condition: z.enum([...CONDITIONS, "none"]),
  negotiableOnly: z.boolean(),
  keywords: z.array(z.string()),
});

module.exports = { 
  SearchIntentSchema, 
  CATEGORIES, 
  SUBCATEGORIES, // Exporting the flat array for your tool definition
  SUBCATEGORIES_MAP, 
  CONDITIONS 
};
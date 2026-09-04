import type { Product } from '../types'
import { todayISO } from './date'

// Generates a realistic ~150 item grocery catalogue with valid EAN-13
// barcodes. Used for the downloadable sample file and demo seeding.

type Row = [string, string, string, string, number, number, number, string]

const ROWS: Row[] = [
  // Dairy
  ['White Milk 2L', 'Dairy', 'Pauls', 'bottle', 5.1, 6.9, 12, 'Dairy'],
  ['Light Milk 1L', 'Dairy', 'Pauls', 'bottle', 1.7, 2.4, 10, 'Dairy'],
  ['Skim Milk 1L', 'Dairy', 'Dairy Farmers', 'bottle', 1.6, 2.3, 8, 'Dairy'],
  ['Butter 500g', 'Dairy', 'Western Star', 'block', 4.4, 5.9, 8, 'Dairy'],
  ['Tasty Cheese 500g', 'Dairy', 'Bega', 'block', 6.4, 8.6, 6, 'Dairy'],
  ['Shredded Cheese 250g', 'Dairy', 'Coles', 'bag', 4.0, 5.4, 6, 'Dairy'],
  ['Greek Yoghurt 1kg', 'Dairy', 'Chobani', 'tub', 4.4, 6.6, 6, 'Dairy'],
  ['Vanilla Yoghurt 6pk', 'Dairy', 'Dairy Farmers', 'pack', 5.0, 6.4, 5, 'Dairy'],
  ['Thickened Cream 300ml', 'Dairy', 'Pura', 'carton', 2.6, 3.4, 8, 'Dairy'],
  ['Sour Cream 300g', 'Dairy', 'Pauls', 'tub', 2.9, 3.8, 5, 'Dairy'],
  ['Free Range Eggs 12', 'Dairy', 'Manning', 'dozen', 4.9, 6.8, 10, 'Dairy'],
  ['Cage Eggs 700g', 'Dairy', 'Coles', 'dozen', 3.6, 4.8, 8, 'Dairy'],
  // Meat & Seafood
  ['Beef Mince 500g', 'Meat & Seafood', 'Coles', 'tray', 6.5, 8.9, 10, 'Meat'],
  ['Chicken Breast 1kg', 'Meat & Seafood', 'Steggles', 'tray', 10.5, 13.9, 6, 'Meat'],
  ['Drumsticks 1kg', 'Meat & Seafood', 'Steggles', 'tray', 8.5, 11.5, 6, 'Meat'],
  ['Lamb Chop Rack 700g', 'Meat & Seafood', 'Thomas Farms', 'tray', 15.9, 22.9, 3, 'Meat'],
  ['Pork Loin Chops 600g', 'Meat & Seafood', 'Coles', 'tray', 8.9, 12.9, 4, 'Meat'],
  ['Middle Bacon 1kg', 'Meat & Seafood', 'Hans', 'tray', 9.9, 13.5, 5, 'Meat'],
  ['Smoked Ham 500g', 'Meat & Seafood', 'Dons', 'pack', 5.9, 8.9, 5, 'Meat'],
  ['Barramundi 400g', 'Meat & Seafood', 'Tassal', 'tray', 11.9, 15.9, 5, 'Seafood'],
  ['Cooked Prawns 1kg', 'Meat & Seafood', 'Oceania', 'pack', 14.9, 19.9, 3, 'Seafood'],
  // Produce
  ['Bananas 1kg', 'Produce', 'Fresh', 'kg', 2.2, 2.8, 20, 'Produce'],
  ['Gala Apples 1kg', 'Produce', 'Fresh', 'kg', 3.5, 4.4, 15, 'Produce'],
  ['Broccoli 1', 'Produce', 'Fresh', 'each', 1.6, 2.4, 12, 'Produce'],
  ['Baby Spinach 120g', 'Produce', 'Fresh', 'bag', 2.2, 3.4, 10, 'Produce'],
  ['Roma Tomatoes 1kg', 'Produce', 'Fresh', 'kg', 3.9, 5.2, 10, 'Produce'],
  ['Iceberg Lettuce', 'Produce', 'Fresh', 'each', 2.4, 3.2, 8, 'Produce'],
  ['Potatoes 1kg', 'Produce', 'Fresh', 'kg', 2.1, 2.7, 10, 'Produce'],
  ['Red Onions 1kg', 'Produce', 'Fresh', 'kg', 2.1, 2.7, 10, 'Produce'],
  ['Strawberries 250g', 'Produce', 'Berries', 'punnet', 2.9, 4.4, 8, 'Produce'],
  ['Blueberries 150g', 'Produce', 'Berries', 'punnet', 3.4, 4.9, 5, 'Produce'],
  ['Avocado 2pk', 'Produce', 'Fresh', 'pack', 3.9, 5.4, 5, 'Produce'],
  ['Baby Spinach Tubs 180g', 'Produce', 'Fresh', 'tub', 2.4, 3.2, 8, 'Produce'],
  // Bakery
  ['White Bread 700g', 'Bakery', 'Tip Top', 'loaf', 2.6, 3.6, 15, 'Bakery'],
  ['Wholemeal Bread 700g', 'Bakery', 'Burgen', 'loaf', 3.1, 4.2, 10, 'Bakery'],
  ['Croissants 4pk', 'Bakery', 'Coles', 'pack', 2.4, 3.5, 6, 'Bakery'],
  ['Muffins 4pk', 'Bakery', 'Coles', 'pack', 3.0, 4.4, 5, 'Bakery'],
  ['Bagels 4pk', 'Bakery', 'Coles', 'pack', 3.2, 4.8, 4, 'Bakery'],
  // Chilled
  ['Deli Ham 150g', 'Chilled', 'Hans', 'pack', 3.9, 5.6, 6, 'Deli'],
  ['Garlic Bread 300g', 'Chilled', 'La Famiglia', 'pack', 3.0, 4.2, 5, 'Chilled'],
  ['Pasta Salad 300g', 'Chilled', 'Coles', 'tub', 4.2, 5.9, 4, 'Chilled'],
  ['Coleslaw 400g', 'Chilled', 'Fresh', 'tub', 3.4, 4.6, 5, 'Chilled'],
  // Pantry
  ['Spaghetti 500g', 'Pantry', 'San Remo', 'packet', 1.5, 2.2, 12, 'Pantry'],
  ['Pasta 500g', 'Pantry', 'Coles', 'packet', 1.2, 1.9, 10, 'Pantry'],
  ['White Rice 1kg', 'Pantry', 'SunRice', 'bag', 2.4, 3.4, 10, 'Pantry'],
  ['Coconut Milk 400ml', 'Pantry', 'Ayam', 'can', 1.4, 2.0, 8, 'Pantry'],
  ['Tomato Sauce 500ml', 'Pantry', 'Rosella', 'bottle', 2.6, 3.6, 8, 'Pantry'],
  ['Olive Oil 1L', 'Pantry', 'Cobram Estate', 'bottle', 9.9, 13.9, 5, 'Pantry'],
  ['Sugar 1kg', 'Pantry', 'CSR', 'bag', 1.8, 2.5, 10, 'Pantry'],
  ['Flour 1kg', 'Pantry', 'White Wings', 'bag', 1.5, 2.4, 8, 'Pantry'],
  ['Instant Coffee 100g', 'Pantry', 'Nescafe', 'jar', 6.9, 8.9, 6, 'Pantry'],
  ['Honey 375g', 'Pantry', 'Capilano', 'jar', 5.9, 7.9, 5, 'Pantry'],
  ['Baked Beans 420g', 'Pantry', 'Heinz', 'can', 1.5, 2.1, 10, 'Pantry'],
  ['Corn Kernels 425g', 'Pantry', 'Coles', 'can', 1.1, 1.7, 8, 'Pantry'],
  ['Diced Tomatoes 400g', 'Pantry', 'Coles', 'can', 0.9, 1.3, 12, 'Pantry'],
  ['Peanut Butter 500g', 'Pantry', 'Bega', 'jar', 3.4, 4.7, 6, 'Pantry'],
  ['Strawberry Jam 500g', 'Pantry', 'Coles', 'jar', 2.4, 3.3, 6, 'Pantry'],
  ['Weet-Bix 1.4kg', 'Pantry', 'Sanitarium', 'box', 4.6, 6.2, 6, 'Breakfast'],
  ['Cornflakes 500g', 'Pantry', 'Kelloggs', 'box', 3.9, 5.2, 5, 'Breakfast'],
  ['Rolled Oats 1kg', 'Pantry', 'Uncle Tobys', 'pack', 3.4, 4.6, 5, 'Breakfast'],
  // Snacks
  ['Choc Biscuits 250g', 'Snacks', 'Arnotts', 'pack', 2.4, 3.4, 8, 'Biscuits'],
  ['Potato Chips 170g', 'Snacks', 'Smiths', 'bag', 3.0, 4.2, 10, 'Snacks'],
  ['Popcorn 100g', 'Snacks', 'Coles', 'bag', 2.0, 2.9, 6, 'Snacks'],
  ['Chocolate Block 180g', 'Snacks', 'Cadbury', 'block', 3.6, 4.9, 8, 'Confectionery'],
  ['Party Mix 300g', 'Snacks', 'Allen', 'bag', 2.4, 3.4, 5, 'Confectionery'],
  ['Muesli Bars 6pk', 'Snacks', 'Uncle Toby', 'pack', 3.4, 4.7, 6, 'Snacks'],
  // Beverages
  ['Cola 1.25L', 'Beverages', 'Coca-Cola', 'bottle', 2.2, 3.0, 10, 'Soft Drinks'],
  ['Orange Juice 2L', 'Beverages', 'Daily Juice', 'bottle', 3.2, 4.4, 8, 'Juice'],
  ['Apple Juice 1L', 'Beverages', 'Pure Juice', 'bottle', 2.4, 3.3, 6, 'Juice'],
  ['Tea Bags 100', 'Beverages', 'Bushells', 'pack', 3.4, 4.6, 8, 'Hot Drinks'],
  ['Ground Coffee 500g', 'Beverages', 'Vittoria', 'pack', 8.9, 11.9, 4, 'Hot Drinks'],
  ['Sparkling Water 1.25L', 'Beverages', 'Coles', 'bottle', 1.0, 1.5, 6, 'Soft Drinks'],
  ['Lager 24pk 375ml', 'Beverages', 'VB', 'carton', 24.0, 34.0, 4, 'Beer'],
  ['Chardonnay 750ml', 'Beverages', 'Hardys', 'bottle', 8.0, 12.0, 4, 'Wine'],
  // Frozen
  ['Frozen Peas 1kg', 'Frozen', 'Coles', 'bag', 1.9, 2.6, 8, 'Frozen'],
  ['Mixed Veg 1kg', 'Frozen', 'Birds Eye', 'bag', 2.6, 3.6, 8, 'Frozen'],
  ['Fish Fingers 500g', 'Frozen', 'Birds Eye', 'box', 4.4, 5.9, 5, 'Frozen'],
  ['Ice Cream 2L', 'Frozen', 'Streets', 'tub', 5.0, 6.8, 6, 'Frozen'],
  ['Frozen Pizza 400g', 'Frozen', 'McCain', 'pack', 3.6, 4.9, 4, 'Frozen'],
  ['Frozen Berries 500g', 'Frozen', 'Coles', 'bag', 3.4, 4.6, 4, 'Frozen'],
  // Cleaning
  ['Dish Liquid 500ml', 'Cleaning', 'Morning Fresh', 'bottle', 2.9, 3.9, 5, 'Cleaning'],
  ['Laundry Powder 1kg', 'Cleaning', 'Omo', 'kg', 6.9, 8.9, 5, 'Laundry'],
  ['Multi-surface Cleaner 750ml', 'Cleaning', 'Janola', 'bottle', 3.6, 4.8, 6, 'Cleaning'],
  ['Toilet Cleaner 750ml', 'Cleaning', 'Domestos', 'bottle', 2.6, 3.6, 5, 'Cleaning'],
  // Household
  ['Paper Towels 2pk', 'Household', 'Paseo', 'pack', 3.4, 4.7, 5, 'Household'],
  ['Toilet Paper 9pk', 'Household', 'Kleenex', 'pack', 9.9, 13.5, 8, 'Household'],
  ['Tissues 3pk', 'Household', 'Kleenex', 'pack', 3.6, 4.9, 5, 'Household'],
  ['Garbage Bags 30', 'Household', 'Multix', 'box', 3.4, 4.6, 5, 'Household'],
  ['Aluminium Foil 30m', 'Household', 'Glad', 'roll', 2.8, 3.9, 4, 'Household'],
  ['Cling Wrap 45m', 'Household', 'Glad', 'roll', 2.6, 3.6, 4, 'Household'],
  // Personal Care
  ['Shampoo 400ml', 'Personal Care', 'Pantene', 'bottle', 5.4, 7.9, 5, 'Personal Care'],
  ['Toothpaste 150g', 'Personal Care', 'Colgate', 'tube', 2.4, 3.5, 8, 'Personal Care'],
  ['Bar Soap 4pk', 'Personal Care', 'Ivory', 'pack', 2.8, 3.9, 5, 'Personal Care'],
  ['Deodorant 150ml', 'Personal Care', 'Nivea', 'bottle', 4.4, 5.9, 4, 'Personal Care'],
  ['Hand Wash 500ml', 'Personal Care', 'Dettol', 'bottle', 3.4, 4.6, 5, 'Personal Care'],
  // Baby
  ['Nappies 30', 'Baby', 'Huggies', 'pack', 8.4, 13.9, 5, 'Baby'],
  ['Infant Formula 900g', 'Baby', 'Aptamil', 'tin', 23.0, 29.0, 3, 'Baby'],
  ['Baby Wipes 80', 'Baby', 'Cure', 'pack', 2.6, 3.6, 6, 'Baby'],
  // Pet / Other
  ['Dog Food 7.5kg', 'Pet', 'Purina', 'bag', 15.0, 21.0, 3, 'Pet'],
  ['Cat Food 1.5kg', 'Pet', 'Whiskas', 'bag', 8.9, 12.5, 3, 'Pet'],
  ['AA Batteries 4pk', 'General', 'Duracell', 'pack', 5.4, 7.9, 4, 'Electronics'],
]

const CATALOG: Row[] = ROWS

let seq = 10_000_000

export function generateSampleCatalogue(): Product[] {
  return CATALOG.map((r) => {
    const base = String(seq++)
    const barcode = makeEan13(base.padStart(12, '0'))
    return {
      id: 'p_' + Math.random().toString(36).slice(2, 10),
      storeId: '',
      name: r[0], barcode, sku: 'SKU-' + String(seq).slice(-6), category: r[1], brand: r[2],
      supplierId: '', supplierName: 'Allco Foods',
      costCents: Math.round(r[4] * 100), sellCents: Math.round(r[5] * 100),
      minStock: r[6], targetStock: Math.round(r[6] * 3),
      unit: r[3], aisle: r[7], shelf: 'Shelf 1', notes: '',
      expiryTracking: shortLife(r[1]) ? 'required' : 'optional',
      active: true, createdAt: todayISO(), updatedAt: todayISO(),
      totalStock: 0, stockValueCents: 0, salesHistory: [],
    }
  })
}

function shortLife(c: string) { return ['Dairy', 'Meat & Seafood', 'Bakery', 'Chilled', 'Produce', 'Frozen'].includes(c) }
function makeEan13(base12: string): string {
  let sum = 0
  for (let i = 0; i < 12; i++) { const d = Number(base12[i]); const w = i % 2 === 0 ? 1 : 3; sum += d * w }
  const cd = (10 - (sum % 10)) % 10
  return base12 + cd
}
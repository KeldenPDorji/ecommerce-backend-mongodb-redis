import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from '../src/models/User';
import { Category } from '../src/models/Category';
import { Product } from '../src/models/Product';
import { Order } from '../src/models/Order';
import { Review } from '../src/models/Review';
import { Inventory } from '../src/models/Inventory';
import { getRedis, closeRedis } from '../src/config/redis';
import { redisService } from '../src/services/redis.service';

const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/ecommerce';

// ── Category seed data ────────────────────────────────────────────────────────
const categoryData = [
  { name: 'Electronics', description: 'Gadgets and electronic devices' },
  { name: 'Laptops', description: 'Portable computers', parentName: 'Electronics' },
  { name: 'Smartphones', description: 'Mobile phones', parentName: 'Electronics' },
  { name: 'Clothing', description: 'Apparel and fashion' },
  { name: 'Men\'s Clothing', description: 'Clothing for men', parentName: 'Clothing' },
  { name: 'Women\'s Clothing', description: 'Clothing for women', parentName: 'Clothing' },
  { name: 'Books', description: 'Physical and digital books' },
  { name: 'Sports', description: 'Sports and outdoor equipment' },
  { name: 'Home & Garden', description: 'Furniture, decor, and garden supplies' },
  { name: 'Beauty', description: 'Skincare, makeup, and personal care' },
];

// ── User seed data ────────────────────────────────────────────────────────────
const userData = [
  { name: 'Alice Admin', email: 'alice@xyzshope.com', password: 'Admin1234!', role: 'admin' as const },
  { name: 'Bob Seller', email: 'bob@xyzshope.com', password: 'Seller123!', role: 'seller' as const },
  { name: 'Carol Customer', email: 'carol@xyzshope.com', password: 'Customer1!', role: 'customer' as const },
  { name: 'Dave Buyer', email: 'dave@xyzshope.com', password: 'Buyer1234!', role: 'customer' as const },
  { name: 'Eve Shopper', email: 'eve@xyzshope.com', password: 'Shopper12!', role: 'customer' as const },
  { name: 'Frank User', email: 'frank@xyzshope.com', password: 'Password1!', role: 'customer' as const },
  { name: 'Grace Green', email: 'grace@xyzshope.com', password: 'Password1!', role: 'customer' as const },
  { name: 'Hank Hill', email: 'hank@xyzshope.com', password: 'Password1!', role: 'customer' as const },
  { name: 'Iris Ivanova', email: 'iris@xyzshope.com', password: 'Password1!', role: 'seller' as const },
  { name: 'Jack Jones', email: 'jack@xyzshope.com', password: 'Password1!', role: 'customer' as const },
];

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Clear existing data
  await Promise.all([
    User.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
    Order.deleteMany({}),
    Review.deleteMany({}),
    Inventory.deleteMany({}),
  ]);
  console.log('Cleared existing data');

  // ── Seed categories ──────────────────────────────────────────────────────
  const topLevelCats = categoryData.filter((c) => !c.parentName);
  const subCats = categoryData.filter((c) => c.parentName);

  const createdTopCats = await Category.create(topLevelCats.map((c) => ({ name: c.name, description: c.description })));
  const catMap = new Map(createdTopCats.map((c) => [c.name, c._id]));

  const createdSubCats = await Category.create(
    subCats.map((c) => ({
      name: c.name,
      description: c.description,
      parent: catMap.get(c.parentName!),
    }))
  );
  createdSubCats.forEach((c) => catMap.set(c.name, c._id));
  console.log(`Created ${createdTopCats.length + createdSubCats.length} categories`);

  // ── Seed users ──────────────────────────────────────────────────────────
  const users = await User.create(userData);
  console.log(`Created ${users.length} users`);
  const userMap = new Map(users.map((u) => [u.email, u._id]));

  // ── Seed 50 products ─────────────────────────────────────────────────────
  const laptopCatId = catMap.get('Laptops')!;
  const phoneCatId = catMap.get('Smartphones')!;
  const mensCatId = catMap.get("Men's Clothing")!;
  const womensCatId = catMap.get("Women's Clothing")!;
  const booksCatId = catMap.get('Books')!;
  const sportsCatId = catMap.get('Sports')!;
  const homeCatId = catMap.get('Home & Garden')!;
  const beautyCatId = catMap.get('Beauty')!;

  const productData = [
    // Laptops (8)
    { name: 'ProBook X1 14"', sku: 'LAP-001', price: 899.99, stock: 50, category: laptopCatId, description: 'Intel Core i7, 16GB RAM, 512GB SSD, ideal for professionals.', tags: ['laptop', 'intel', 'work'], attributes: { RAM: '16GB', Storage: '512GB', CPU: 'Intel i7' } },
    { name: 'SlimNote Air 13"', sku: 'LAP-002', price: 1199.99, stock: 35, category: laptopCatId, description: 'Ultra-thin laptop with 18-hour battery and Retina display.', tags: ['laptop', 'ultrabook', 'thin'], attributes: { RAM: '8GB', Storage: '256GB', CPU: 'Apple M2' } },
    { name: 'GameBeast G5', sku: 'LAP-003', price: 1599.99, stock: 20, category: laptopCatId, description: 'High-performance gaming laptop with RTX 4070 GPU.', tags: ['gaming', 'laptop', 'rtx'], attributes: { RAM: '32GB', Storage: '1TB', GPU: 'RTX 4070' } },
    { name: 'WorkStation Z9', sku: 'LAP-004', price: 2499.99, stock: 15, category: laptopCatId, description: 'Mobile workstation for 3D rendering and video editing.', tags: ['workstation', 'laptop', 'rendering'], attributes: { RAM: '64GB', Storage: '2TB', CPU: 'Intel Xeon' } },
    { name: 'Budget Laptop B1', sku: 'LAP-005', price: 349.99, stock: 80, category: laptopCatId, description: 'Affordable laptop for everyday tasks and browsing.', tags: ['budget', 'laptop', 'affordable'], attributes: { RAM: '4GB', Storage: '128GB', CPU: 'Intel Celeron' } },
    { name: 'Creator Studio 16"', sku: 'LAP-006', price: 1899.99, stock: 25, category: laptopCatId, description: 'Designed for creatives with colour-accurate OLED display.', tags: ['creator', 'laptop', 'oled'], attributes: { RAM: '32GB', Storage: '1TB', Display: 'OLED 4K' } },
    { name: 'ChromeBook Lite', sku: 'LAP-007', price: 279.99, stock: 60, category: laptopCatId, description: 'Lightweight Chromebook for students and light users.', tags: ['chromebook', 'student', 'lightweight'], attributes: { RAM: '4GB', Storage: '64GB', OS: 'ChromeOS' } },
    { name: 'ThinkPad E15 Business', sku: 'LAP-008', price: 749.99, stock: 40, category: laptopCatId, description: 'Reliable business laptop with MIL-SPEC durability.', tags: ['business', 'laptop', 'durable'], attributes: { RAM: '16GB', Storage: '512GB', CPU: 'AMD Ryzen 7' } },
    // Smartphones (8)
    { name: 'Galaxy S Ultra', sku: 'PHN-001', price: 1099.99, stock: 45, category: phoneCatId, description: 'Flagship Android phone with 200MP camera and S-Pen.', tags: ['smartphone', 'android', 'samsung'], attributes: { RAM: '12GB', Storage: '256GB', Camera: '200MP' } },
    { name: 'iPhone 15 Pro', sku: 'PHN-002', price: 999.99, stock: 50, category: phoneCatId, description: 'Apple\'s latest flagship with titanium frame and A17 chip.', tags: ['iphone', 'apple', 'flagship'], attributes: { RAM: '8GB', Storage: '128GB', Chip: 'A17 Pro' } },
    { name: 'Pixel 8 Pro', sku: 'PHN-003', price: 799.99, stock: 30, category: phoneCatId, description: 'Google\'s AI-powered phone with 7 years of updates.', tags: ['pixel', 'google', 'android', 'ai'], attributes: { RAM: '12GB', Storage: '128GB', AI: 'Google Tensor G3' } },
    { name: 'Budget Phone X2', sku: 'PHN-004', price: 199.99, stock: 100, category: phoneCatId, description: 'Affordable smartphone with long battery life.', tags: ['budget', 'phone', 'affordable'], attributes: { RAM: '4GB', Storage: '64GB', Battery: '5000mAh' } },
    { name: 'Fold Z Flip 5G', sku: 'PHN-005', price: 1299.99, stock: 20, category: phoneCatId, description: 'Foldable smartphone with flexible OLED display.', tags: ['foldable', 'phone', 'oled'], attributes: { RAM: '12GB', Storage: '512GB', Display: 'Foldable OLED' } },
    { name: 'Mid-range Pro M7', sku: 'PHN-006', price: 449.99, stock: 70, category: phoneCatId, description: 'Great value mid-range phone with excellent camera.', tags: ['mid-range', 'phone', 'camera'], attributes: { RAM: '8GB', Storage: '128GB', Camera: '108MP' } },
    { name: 'Rugged Phone X-Treme', sku: 'PHN-007', price: 599.99, stock: 25, category: phoneCatId, description: 'Military-grade rugged phone for outdoor enthusiasts.', tags: ['rugged', 'outdoor', 'waterproof'], attributes: { RAM: '6GB', Storage: '128GB', IP: 'IP68' } },
    { name: 'Compact Mini Phone', sku: 'PHN-008', price: 649.99, stock: 35, category: phoneCatId, description: 'Compact flagship for those who prefer smaller phones.', tags: ['compact', 'flagship', 'small'], attributes: { RAM: '8GB', Storage: '256GB', Size: '5.4 inch' } },
    // Men's Clothing (6)
    { name: 'Classic Oxford Shirt', sku: 'MEN-001', price: 49.99, stock: 120, category: mensCatId, description: 'Timeless Oxford shirt in premium cotton blend.', tags: ['shirt', 'oxford', 'formal'], attributes: { Material: '100% Cotton', Fit: 'Regular', Collar: 'Button-down' } },
    { name: 'Slim Fit Chinos', sku: 'MEN-002', price: 59.99, stock: 100, category: mensCatId, description: 'Versatile slim-fit chino trousers for casual and smart casual.', tags: ['chinos', 'trousers', 'slim'], attributes: { Material: '97% Cotton', Fit: 'Slim', Waist: '32' } },
    { name: 'Merino Wool Sweater', sku: 'MEN-003', price: 89.99, stock: 60, category: mensCatId, description: 'Soft merino wool sweater for cooler days.', tags: ['sweater', 'wool', 'knit'], attributes: { Material: 'Merino Wool', Fit: 'Regular', Weight: 'Lightweight' } },
    { name: 'Denim Jacket Classic', sku: 'MEN-004', price: 79.99, stock: 55, category: mensCatId, description: 'Classic denim jacket with worn finish.', tags: ['jacket', 'denim', 'casual'], attributes: { Material: '100% Cotton', Fit: 'Regular', Wash: 'Medium' } },
    { name: 'Athletic Running Shorts', sku: 'MEN-005', price: 34.99, stock: 150, category: mensCatId, description: 'Lightweight running shorts with liner and back pocket.', tags: ['shorts', 'running', 'athletic'], attributes: { Material: 'Polyester', Length: '7 inch', Feature: 'Built-in liner' } },
    { name: 'Formal Suit Blazer', sku: 'MEN-006', price: 199.99, stock: 30, category: mensCatId, description: 'Single-breasted blazer in Italian wool blend.', tags: ['blazer', 'formal', 'suit'], attributes: { Material: 'Wool Blend', Fit: 'Tailored', Buttons: 'Single-breasted' } },
    // Women's Clothing (6)
    { name: 'Floral Summer Dress', sku: 'WOM-001', price: 54.99, stock: 90, category: womensCatId, description: 'Light and breezy floral print sundress.', tags: ['dress', 'summer', 'floral'], attributes: { Material: 'Viscose', Length: 'Midi', Neckline: 'V-neck' } },
    { name: 'Cashmere Cardigan', sku: 'WOM-002', price: 129.99, stock: 45, category: womensCatId, description: 'Luxurious cashmere cardigan in classic colours.', tags: ['cardigan', 'cashmere', 'luxury'], attributes: { Material: '100% Cashmere', Fit: 'Relaxed', Buttons: 'Pearl' } },
    { name: 'High-Waist Leggings', sku: 'WOM-003', price: 39.99, stock: 200, category: womensCatId, description: 'Compression high-waist leggings with squat-proof fabric.', tags: ['leggings', 'activewear', 'yoga'], attributes: { Material: 'Nylon/Spandex', Rise: 'High', Feature: 'Squat-proof' } },
    { name: 'Tailored Blazer White', sku: 'WOM-004', price: 149.99, stock: 40, category: womensCatId, description: 'Sharp tailored blazer for the modern professional.', tags: ['blazer', 'professional', 'office'], attributes: { Material: 'Polyester Blend', Fit: 'Tailored', Closure: 'Single button' } },
    { name: 'Boho Maxi Skirt', sku: 'WOM-005', price: 44.99, stock: 70, category: womensCatId, description: 'Flowing boho-style maxi skirt with elastic waist.', tags: ['skirt', 'boho', 'maxi'], attributes: { Material: 'Rayon', Length: 'Maxi', Waist: 'Elastic' } },
    { name: 'Silk Blouse Ivory', sku: 'WOM-006', price: 84.99, stock: 55, category: womensCatId, description: 'Pure silk blouse with delicate pearl buttons.', tags: ['blouse', 'silk', 'elegant'], attributes: { Material: '100% Silk', Collar: 'Pointed', Closure: 'Pearl buttons' } },
    // Books (5)
    { name: 'Clean Code', sku: 'BOK-001', price: 34.99, stock: 200, category: booksCatId, description: 'A handbook of agile software craftsmanship by Robert C. Martin.', tags: ['programming', 'software', 'coding'], attributes: { Author: 'Robert C. Martin', Pages: '464', Publisher: "O'Reilly" } },
    { name: 'Atomic Habits', sku: 'BOK-002', price: 24.99, stock: 300, category: booksCatId, description: 'An easy and proven way to build good habits and break bad ones.', tags: ['self-help', 'habits', 'productivity'], attributes: { Author: 'James Clear', Pages: '320', Publisher: 'Avery' } },
    { name: 'The Pragmatic Programmer', sku: 'BOK-003', price: 49.99, stock: 150, category: booksCatId, description: 'Your journey to mastery, 20th anniversary edition.', tags: ['programming', 'software', 'career'], attributes: { Author: 'Hunt & Thomas', Pages: '352', Publisher: 'Addison-Wesley' } },
    { name: 'Dune (Box Set)', sku: 'BOK-004', price: 59.99, stock: 80, category: booksCatId, description: 'The complete Dune chronicles box set.', tags: ['scifi', 'fiction', 'dune'], attributes: { Author: 'Frank Herbert', Books: '6', Publisher: 'Hodder' } },
    { name: 'The Great Gatsby', sku: 'BOK-005', price: 12.99, stock: 400, category: booksCatId, description: 'F. Scott Fitzgerald\'s masterpiece of the Jazz Age.', tags: ['classic', 'fiction', 'literary'], attributes: { Author: 'F. Scott Fitzgerald', Pages: '180', Publisher: 'Scribner' } },
    // Sports (5)
    { name: 'Yoga Mat Pro', sku: 'SPT-001', price: 69.99, stock: 100, category: sportsCatId, description: 'Non-slip, eco-friendly cork yoga mat with alignment lines.', tags: ['yoga', 'fitness', 'mat'], attributes: { Material: 'Natural Cork', Thickness: '6mm', Width: '24 inch' } },
    { name: 'Resistance Band Set', sku: 'SPT-002', price: 29.99, stock: 200, category: sportsCatId, description: 'Set of 5 resistance bands with different intensities.', tags: ['resistance', 'workout', 'bands'], attributes: { Pieces: '5', Material: 'Latex', Levels: 'Light to X-Heavy' } },
    { name: 'Trail Running Shoes', sku: 'SPT-003', price: 119.99, stock: 60, category: sportsCatId, description: 'Grippy trail running shoes with Vibram outsole.', tags: ['shoes', 'running', 'trail'], attributes: { Material: 'Mesh + TPU', Sole: 'Vibram', Drop: '8mm' } },
    { name: 'Adjustable Dumbbell Set', sku: 'SPT-004', price: 249.99, stock: 30, category: sportsCatId, description: 'Space-saving adjustable dumbbell set from 5–50 lbs.', tags: ['weights', 'dumbbell', 'gym'], attributes: { Weight: '5-50 lbs', Material: 'Steel', Adjustment: 'Dial select' } },
    { name: 'Cycling Helmet Pro', sku: 'SPT-005', price: 89.99, stock: 50, category: sportsCatId, description: 'Aerodynamic road cycling helmet with MIPS technology.', tags: ['cycling', 'helmet', 'safety'], attributes: { Standard: 'CPSC/CE', Ventilation: '14 vents', Feature: 'MIPS' } },
    // Home (6)
    { name: 'Ergonomic Office Chair', sku: 'HOM-001', price: 349.99, stock: 25, category: homeCatId, description: 'Full adjustable ergonomic chair with lumbar support.', tags: ['chair', 'office', 'ergonomic'], attributes: { Material: 'Mesh Back', Height: 'Adjustable', Armrests: '4D' } },
    { name: 'Bamboo Cutting Board', sku: 'HOM-002', price: 24.99, stock: 120, category: homeCatId, description: 'Eco-friendly bamboo cutting board with juice groove.', tags: ['kitchen', 'bamboo', 'eco'], attributes: { Material: 'Bamboo', Size: '18x12 inch', Feature: 'Juice groove' } },
    { name: 'Smart LED Bulb 4-Pack', sku: 'HOM-003', price: 39.99, stock: 180, category: homeCatId, description: 'WiFi-controlled RGB LED bulbs compatible with Alexa/Google.', tags: ['smart', 'led', 'wifi'], attributes: { Wattage: '9W', Lumens: '800lm', Compatibility: 'Alexa, Google Home' } },
    { name: 'Air Purifier HEPA', sku: 'HOM-004', price: 149.99, stock: 40, category: homeCatId, description: 'True HEPA air purifier covering up to 500 sq ft.', tags: ['air purifier', 'hepa', 'health'], attributes: { Coverage: '500 sqft', Filter: 'True HEPA', Noise: '24dB' } },
    { name: 'Linen Bed Sheet Set', sku: 'HOM-005', price: 79.99, stock: 85, category: homeCatId, description: 'Breathable 100% linen sheet set for queen beds.', tags: ['bedding', 'linen', 'sleep'], attributes: { Material: '100% Linen', Thread: '170TC', Size: 'Queen' } },
    { name: 'Cast Iron Skillet 12"', sku: 'HOM-006', price: 44.99, stock: 90, category: homeCatId, description: 'Pre-seasoned cast iron skillet for stovetop and oven.', tags: ['cookware', 'cast iron', 'kitchen'], attributes: { Material: 'Cast Iron', Diameter: '12 inch', Oven: 'Safe to 500°F' } },
    // Beauty (6)
    { name: 'Vitamin C Serum', sku: 'BTY-001', price: 34.99, stock: 150, category: beautyCatId, description: '20% Vitamin C serum for brightening and anti-aging.', tags: ['serum', 'vitamin c', 'skincare'], attributes: { Concentration: '20%', Size: '30ml', Skin: 'All types' } },
    { name: 'Hyaluronic Acid Moisturiser', sku: 'BTY-002', price: 29.99, stock: 130, category: beautyCatId, description: 'Lightweight daily moisturiser with hyaluronic acid.', tags: ['moisturiser', 'hyaluronic', 'hydration'], attributes: { Size: '50ml', Fragrance: 'Free', SPF: 'None' } },
    { name: 'Retinol Night Cream', sku: 'BTY-003', price: 44.99, stock: 100, category: beautyCatId, description: 'Retinol 0.5% night cream for smoother skin texture.', tags: ['retinol', 'anti-aging', 'night cream'], attributes: { Retinol: '0.5%', Size: '50ml', Use: 'Night' } },
    { name: 'SPF 50 Sunscreen', sku: 'BTY-004', price: 19.99, stock: 200, category: beautyCatId, description: 'Broad spectrum SPF 50 lightweight sunscreen.', tags: ['sunscreen', 'spf', 'protection'], attributes: { SPF: '50', Size: '100ml', Type: 'Broad spectrum' } },
    { name: 'Electric Face Cleanser', sku: 'BTY-005', price: 59.99, stock: 70, category: beautyCatId, description: 'Silicone facial cleansing brush with 3 modes.', tags: ['cleanser', 'electric', 'face'], attributes: { Modes: '3', Waterproof: 'IPX6', Battery: 'USB rechargeable' } },
    { name: 'Collagen Eye Patches 60-pack', sku: 'BTY-006', price: 24.99, stock: 160, category: beautyCatId, description: 'Hydrogel eye patches infused with collagen and peptides.', tags: ['eye patches', 'collagen', 'skincare'], attributes: { Pieces: '60 patches', Ingredient: 'Collagen + Peptides', Use: 'Under eye' } },
  ];

  const products = await Product.create(productData);
  console.log(`Created ${products.length} products`);
  const productMap = new Map(products.map((p) => [p.sku, p]));

  // ── Seed 20 orders ───────────────────────────────────────────────────────
  const customerIds = [
    userMap.get('carol@xyzshope.com')!,
    userMap.get('dave@xyzshope.com')!,
    userMap.get('eve@xyzshope.com')!,
    userMap.get('frank@xyzshope.com')!,
    userMap.get('grace@xyzshope.com')!,
    userMap.get('hank@xyzshope.com')!,
    userMap.get('jack@xyzshope.com')!,
  ];

  const orderStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'] as const;
  const orderItems = [
    [{ sku: 'LAP-001', qty: 1 }, { sku: 'BOK-001', qty: 2 }],
    [{ sku: 'PHN-002', qty: 1 }],
    [{ sku: 'WOM-001', qty: 2 }, { sku: 'BTY-001', qty: 1 }],
    [{ sku: 'SPT-001', qty: 1 }, { sku: 'SPT-002', qty: 1 }],
    [{ sku: 'HOM-001', qty: 1 }],
    [{ sku: 'LAP-003', qty: 1 }],
    [{ sku: 'MEN-001', qty: 3 }, { sku: 'MEN-002', qty: 2 }],
    [{ sku: 'PHN-001', qty: 1 }, { sku: 'PHN-006', qty: 1 }],
    [{ sku: 'BOK-002', qty: 1 }, { sku: 'BOK-003', qty: 1 }],
    [{ sku: 'BTY-004', qty: 2 }, { sku: 'BTY-002', qty: 1 }],
    [{ sku: 'LAP-002', qty: 1 }],
    [{ sku: 'HOM-003', qty: 2 }, { sku: 'HOM-002', qty: 1 }],
    [{ sku: 'SPT-003', qty: 1 }, { sku: 'SPT-004', qty: 1 }],
    [{ sku: 'WOM-003', qty: 2 }, { sku: 'WOM-004', qty: 1 }],
    [{ sku: 'PHN-003', qty: 1 }],
    [{ sku: 'HOM-004', qty: 1 }, { sku: 'HOM-005', qty: 1 }],
    [{ sku: 'BTY-003', qty: 1 }, { sku: 'BTY-005', qty: 1 }],
    [{ sku: 'LAP-008', qty: 1 }, { sku: 'BOK-001', qty: 1 }],
    [{ sku: 'MEN-006', qty: 1 }],
    [{ sku: 'WOM-002', qty: 1 }, { sku: 'WOM-006', qty: 1 }],
  ];

  const createdOrders: Record<string, unknown>[] = [];
  for (let i = 0; i < 20; i++) {
    const userId = customerIds[i % customerIds.length];
    const items = orderItems[i].map(({ sku, qty }) => {
      const p = productMap.get(sku)!;
      return { product: p._id, name: p.name, image: '', price: p.price, quantity: qty };
    });
    const itemsPrice = items.reduce((s, it) => s + it.price * it.quantity, 0);
    const shippingPrice = itemsPrice >= 50 ? 0 : 5.99;
    const taxPrice = parseFloat((itemsPrice * 0.08).toFixed(2));
    const totalPrice = parseFloat((itemsPrice + shippingPrice + taxPrice).toFixed(2));
    const status = orderStatuses[i % orderStatuses.length];
    const daysAgo = (20 - i) * 3;
    const createdAt = new Date(Date.now() - daysAgo * 86_400_000);

    createdOrders.push({
      user: userId,
      items,
      shippingAddress: {
        fullName: `Customer ${i + 1}`,
        address: `${100 + i} Main Street`,
        city: 'Singapore',
        postalCode: `${600000 + i}`,
        country: 'Singapore',
        phone: `+6598${100000 + i}`,
      },
      itemsPrice,
      shippingPrice,
      taxPrice,
      totalPrice,
      status,
      isPaid: ['delivered', 'shipped', 'processing'].includes(status),
      paymentMethod: 'cod',
      createdAt,
      updatedAt: createdAt,
    });
  }

  const orders = await Order.create(createdOrders);
  console.log(`Created ${orders.length} orders`);

  // ── Seed inventory events ────────────────────────────────────────────────
  const inventoryEvents = orders.flatMap((order) =>
    order.items.map((item) => ({
      product: item.product,
      sku: '',
      delta: -item.quantity,
      reason: 'sale' as const,
      reference: order._id,
      stockAfter: 0,
    }))
  );
  await Inventory.create(inventoryEvents);
  console.log(`Created ${inventoryEvents.length} inventory events`);

  // ── Seed 15 reviews ──────────────────────────────────────────────────────
  const reviewData = [
    { sku: 'LAP-001', userId: customerIds[0], rating: 5, title: 'Best laptop ever!', body: 'Super fast, long battery. Highly recommended for developers.' },
    { sku: 'LAP-001', userId: customerIds[1], rating: 4, title: 'Great but pricey', body: 'Performance is top-notch, slightly expensive but worth it.' },
    { sku: 'PHN-002', userId: customerIds[2], rating: 5, title: 'Love the camera', body: 'The camera system is outstanding. Portrait mode is incredible.' },
    { sku: 'PHN-001', userId: customerIds[0], rating: 4, title: 'Great Android phone', body: 'The S-Pen is very useful. Battery life is excellent.' },
    { sku: 'BOK-001', userId: customerIds[3], rating: 5, title: 'Must-read for developers', body: 'Changed how I write code. Applicable advice on every page.' },
    { sku: 'BOK-002', userId: customerIds[4], rating: 5, title: 'Life-changing book', body: 'Simple, practical advice that actually works. Read it twice.' },
    { sku: 'SPT-001', userId: customerIds[1], rating: 4, title: 'Great yoga mat', body: 'Good grip and nice thickness. Easy to clean.' },
    { sku: 'HOM-001', userId: customerIds[2], rating: 5, title: 'Worth every penny', body: 'My back pain is gone after switching to this chair.' },
    { sku: 'BTY-001', userId: customerIds[3], rating: 4, title: 'Skin feels brighter', body: 'Noticed improvement in 2 weeks. Light and non-greasy.' },
    { sku: 'WOM-001', userId: customerIds[4], rating: 5, title: 'Perfect summer dress', body: 'Flows beautifully, true to size, washed well.' },
    { sku: 'MEN-001', userId: customerIds[5], rating: 3, title: 'Decent quality', body: 'Material is fine but runs small. Order one size up.' },
    { sku: 'PHN-003', userId: customerIds[6], rating: 5, title: 'Best Android experience', body: 'AI features are genuinely useful. Fast updates guaranteed.' },
    { sku: 'LAP-003', userId: customerIds[0], rating: 5, title: 'Gaming beast!', body: 'Handles everything I throw at it. Thermal management is great.' },
    { sku: 'HOM-004', userId: customerIds[1], rating: 4, title: 'Very effective', body: 'Air quality noticeably improved. Quiet even on medium setting.' },
    { sku: 'BTY-004', userId: customerIds[2], rating: 5, title: 'No white cast!', body: 'Finally a sunscreen that goes on clear. Lightweight feel.' },
  ];

  for (const r of reviewData) {
    const p = productMap.get(r.sku)!;
    await Review.create({
      product: p._id,
      user: r.userId,
      rating: r.rating,
      title: r.title,
      body: r.body,
      isVerifiedPurchase: true,
    });
  }
  console.log(`Created ${reviewData.length} reviews`);

  // ── Seed Redis ───────────────────────────────────────────────────────────
  const redis = getRedis();

  // Flush only our namespaced keys so we don't wipe unrelated data
  const keysToFlush = await redis.keys('trending:*');
  const lb = await redis.keys('leaderboard:*');
  const rv = await redis.keys('user:recently_viewed:*');
  const hll = await redis.keys('product:views:unique:*');
  const sess = await redis.keys('session:*');
  const gc = await redis.keys('guest:cart:*');
  const allKeys = [...keysToFlush, ...lb, ...rv, ...hll, ...sess, ...gc];
  if (allKeys.length) await redis.del(...allKeys);

  // Sorted Set 1 - Trending (view + purchase weighted scores)
  const trendingData: Array<{ sku: string; views: number; purchases: number }> = [
    { sku: 'LAP-003', views: 420, purchases: 18 },   // GameBeast - most hyped
    { sku: 'PHN-002', views: 380, purchases: 22 },   // iPhone
    { sku: 'LAP-001', views: 310, purchases: 14 },   // ProBook
    { sku: 'BOK-002', views: 290, purchases: 30 },   // Atomic Habits
    { sku: 'SPT-001', views: 260, purchases: 12 },   // Yoga Mat
    { sku: 'BTY-001', views: 245, purchases: 16 },   // Vitamin C Serum
    { sku: 'HOM-001', views: 230, purchases: 8 },    // Office Chair
    { sku: 'PHN-001', views: 210, purchases: 11 },   // Galaxy S Ultra
    { sku: 'WOM-003', views: 195, purchases: 25 },   // High-Waist Leggings
    { sku: 'BOK-001', views: 175, purchases: 20 },   // Clean Code
  ];
  for (const { sku, views, purchases } of trendingData) {
    const p = productMap.get(sku)!;
    const id = p._id.toString();
    await redisService.incrementTrendingScore(id, views + purchases * 5);
  }
  console.log('Seeded trending Sorted Set (10 products)');

  // Sorted Set 2 - Monthly buyer leaderboard
  const buyerData = [
    { email: 'carol@xyzshope.com', spend: 2399.97 },
    { email: 'dave@xyzshope.com', spend: 1799.94 },
    { email: 'eve@xyzshope.com', spend: 1549.93 },
    { email: 'frank@xyzshope.com', spend: 989.92 },
    { email: 'grace@xyzshope.com', spend: 869.94 },
    { email: 'hank@xyzshope.com', spend: 699.98 },
    { email: 'jack@xyzshope.com', spend: 449.98 },
  ];
  for (const { email, spend } of buyerData) {
    const uid = userMap.get(email)!.toString();
    await redisService.recordPurchase(uid, spend);
  }
  console.log('Seeded leaderboard Sorted Set (7 buyers)');

  // List - Recently viewed per user (last 5 viewed products)
  const carolId = userMap.get('carol@xyzshope.com')!.toString();
  const recentProducts = ['LAP-001', 'PHN-002', 'BOK-001', 'SPT-001', 'BTY-001'];
  for (const sku of recentProducts) {
    await redisService.addRecentlyViewed(carolId, productMap.get(sku)!._id.toString());
  }
  console.log('Seeded recently-viewed List (carol, 5 products)');

  // HyperLogLog - Unique product page visitors
  const hllProducts = ['LAP-003', 'PHN-002', 'BOK-002'];
  const sampleIPs = ['192.168.1.1', '10.0.0.1', '172.16.0.5', '203.0.113.42', '198.51.100.7',
    '203.0.113.1', '192.0.2.55', '10.10.10.10', '8.8.8.8', '1.1.1.1'];
  for (const sku of hllProducts) {
    const id = productMap.get(sku)!._id.toString();
    for (const ip of sampleIPs) await redisService.trackUniqueVisitor(id, ip);
  }
  console.log('Seeded HyperLogLog (3 products × 10 unique IPs each)');

  // Hash - Demo session
  await redisService.setSession('demo-session-001', {
    userId: userMap.get('carol@xyzshope.com')!.toString(),
    role: 'customer',
    name: 'Carol Customer',
    loginAt: new Date().toISOString(),
  }, 3600);
  console.log('Seeded session Hash (demo-session-001)');

  // String - Guest cart
  const guestCart = {
    items: [
      { productId: productMap.get('BTY-001')!._id.toString(), name: 'Vitamin C Serum', price: 34.99, quantity: 2 },
      { productId: productMap.get('BOK-002')!._id.toString(), name: 'Atomic Habits', price: 24.99, quantity: 1 },
    ],
    total: 94.97,
  };
  await redisService.setGuestCart('demo-guest-abc123', guestCart, 86400);
  console.log('Seeded guest cart String (demo-guest-abc123)');

  console.log('\n✅ Seed complete!');
  console.log('   Admin  → alice@xyzshope.com / Admin1234!');
  console.log('   Seller → bob@xyzshope.com   / Seller123!');
  console.log('   Buyer  → carol@xyzshope.com / Customer1!');

  await mongoose.disconnect();
  await closeRedis();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

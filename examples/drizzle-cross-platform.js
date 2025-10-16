/**
 * Cross-platform Drizzle ORM example for Node.js
 * This example shows how to use better-starlite with Drizzle ORM in Node.js
 * The same patterns work with both local SQLite and remote rqlite databases
 *
 * Run with: node examples/drizzle-cross-platform.js
 */

const { createDatabase } = require('../dist/async-unified');
const { drizzle } = require('../dist/drizzle');
const { sql, eq, and, gte, desc, asc } = require('drizzle-orm');
const { integer, sqliteTable, text, real, index } = require('drizzle-orm/sqlite-core');

// Define your schema - this works for both SQLite and rqlite
const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  age: integer('age'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  emailIdx: index('email_idx').on(table.email),
  ageIdx: index('age_idx').on(table.age),
}));

const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  price: real('price').notNull(),
  stock: integer('stock').default(0),
  categoryId: integer('category_id'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

const orders = sqliteTable('orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  productId: integer('product_id').notNull().references(() => products.id),
  quantity: integer('quantity').notNull(),
  totalPrice: real('total_price').notNull(),
  status: text('status').default('pending'),
  orderDate: text('order_date').default(sql`CURRENT_TIMESTAMP`),
});

async function setupDatabase(db) {
  console.log('Setting up database schema...');

  // Create tables
  // Note: For schema creation, use raw SQL strings or db.$client.exec()
  const database = db.$client || db;
  await database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      age INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await database.exec(`
    CREATE INDEX IF NOT EXISTS email_idx ON users(email)
  `);

  await database.exec(`
    CREATE INDEX IF NOT EXISTS age_idx ON users(age)
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      stock INTEGER DEFAULT 0,
      category_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      total_price REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      order_date TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('Schema created successfully!');
}

async function seedData(db) {
  console.log('\nSeeding initial data...');

  // Insert users
  const insertedUsers = await db.insert(users).values([
    { name: 'Alice Johnson', email: 'alice@example.com', age: 28 },
    { name: 'Bob Smith', email: 'bob@example.com', age: 35 },
    { name: 'Charlie Brown', email: 'charlie@example.com', age: 42 },
    { name: 'Diana Prince', email: 'diana@example.com', age: 31 },
    { name: 'Edward Norton', email: 'edward@example.com', age: 29 },
  ]).returning();

  console.log(`Inserted ${insertedUsers.length} users`);

  // Insert products
  const insertedProducts = await db.insert(products).values([
    { name: 'Laptop', description: 'High-performance laptop', price: 1299.99, stock: 10, categoryId: 1 },
    { name: 'Mouse', description: 'Wireless mouse', price: 29.99, stock: 50, categoryId: 2 },
    { name: 'Keyboard', description: 'Mechanical keyboard', price: 89.99, stock: 30, categoryId: 2 },
    { name: 'Monitor', description: '27-inch 4K monitor', price: 499.99, stock: 15, categoryId: 1 },
    { name: 'Headphones', description: 'Noise-canceling headphones', price: 199.99, stock: 25, categoryId: 3 },
  ]).returning();

  console.log(`Inserted ${insertedProducts.length} products`);

  // Create some orders
  const insertedOrders = await db.insert(orders).values([
    { userId: 1, productId: 1, quantity: 1, totalPrice: 1299.99, status: 'completed' },
    { userId: 2, productId: 2, quantity: 2, totalPrice: 59.98, status: 'completed' },
    { userId: 1, productId: 3, quantity: 1, totalPrice: 89.99, status: 'pending' },
    { userId: 3, productId: 4, quantity: 1, totalPrice: 499.99, status: 'shipped' },
    { userId: 4, productId: 5, quantity: 3, totalPrice: 599.97, status: 'pending' },
  ]).returning();

  console.log(`Inserted ${insertedOrders.length} orders`);
}

async function demonstrateQueries(db) {
  console.log('\n=== Demonstrating Drizzle ORM Queries ===\n');

  // 1. Simple select all
  console.log('1. All users:');
  const allUsers = await db.select().from(users);
  console.table(allUsers);

  // 2. Select with conditions
  console.log('\n2. Users older than 30:');
  const olderUsers = await db
    .select()
    .from(users)
    .where(gte(users.age, 30));
  console.table(olderUsers);

  // 3. Select specific columns
  console.log('\n3. User names and emails:');
  const userContacts = await db
    .select({
      name: users.name,
      email: users.email,
    })
    .from(users)
    .orderBy(asc(users.name));
  console.table(userContacts);

  // 4. Join queries
  console.log('\n4. Orders with user and product details:');
  const orderDetails = await db
    .select({
      orderId: orders.id,
      userName: users.name,
      userEmail: users.email,
      productName: products.name,
      quantity: orders.quantity,
      totalPrice: orders.totalPrice,
      status: orders.status,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .innerJoin(products, eq(orders.productId, products.id))
    .orderBy(desc(orders.orderDate));
  console.table(orderDetails);

  // 5. Aggregation
  console.log('\n5. Product inventory value:');
  const inventoryValue = await db
    .select({
      name: products.name,
      stock: products.stock,
      price: products.price,
      totalValue: sql`${products.stock} * ${products.price}`,
    })
    .from(products)
    .orderBy(desc(sql`${products.stock} * ${products.price}`));
  console.table(inventoryValue);

  // 6. Update operation
  console.log('\n6. Updating product stock...');
  await db
    .update(products)
    .set({ stock: sql`${products.stock} - 1` })
    .where(eq(products.name, 'Laptop'));

  const updatedProduct = await db
    .select()
    .from(products)
    .where(eq(products.name, 'Laptop'));
  console.log('Updated laptop stock:', updatedProduct[0].stock);

  // 7. Transaction example
  console.log('\n7. Processing order in transaction...');
  await db.transaction(async (tx) => {
    // Check product stock
    const product = await tx
      .select()
      .from(products)
      .where(eq(products.id, 2))
      .limit(1);

    if (product[0].stock > 0) {
      // Create order
      await tx.insert(orders).values({
        userId: 5,
        productId: 2,
        quantity: 1,
        totalPrice: product[0].price,
        status: 'pending',
      });

      // Update stock
      await tx
        .update(products)
        .set({ stock: sql`${products.stock} - 1` })
        .where(eq(products.id, 2));

      console.log('Order processed successfully');
    } else {
      throw new Error('Product out of stock');
    }
  });

  // 8. Complex query with multiple conditions
  console.log('\n8. Pending orders for expensive products:');
  const pendingExpensiveOrders = await db
    .select({
      orderId: orders.id,
      userName: users.name,
      productName: products.name,
      price: products.price,
      quantity: orders.quantity,
      total: orders.totalPrice,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .innerJoin(products, eq(orders.productId, products.id))
    .where(and(
      eq(orders.status, 'pending'),
      gte(products.price, 100)
    ));
  console.table(pendingExpensiveOrders);

  // 9. Delete operation
  console.log('\n9. Cleaning up old test data...');
  const deleteResult = await db
    .delete(orders)
    .where(eq(orders.status, 'test'))
    .returning();
  console.log(`Deleted ${deleteResult.length} test orders`);
}

async function testWithLocalSQLite() {
  console.log('\n========================================');
  console.log('Testing with Local SQLite Database');
  console.log('========================================\n');

  const database = await createDatabase(':memory:');
  const db = drizzle(database);

  await setupDatabase(db);
  await seedData(db);
  await demonstrateQueries(db);

  await database.close();
  console.log('\nLocal SQLite test completed!');
}

async function testWithRQLite() {
  console.log('\n========================================');
  console.log('Testing with RQLite Database');
  console.log('========================================\n');

  const rqliteUrl = process.env.RQLITE_URL || 'http://localhost:4001';

  try {
    const database = await createDatabase(rqliteUrl);
    const db = drizzle(database);

    await setupDatabase(db);
    await seedData(db);
    await demonstrateQueries(db);

    await database.close();
    console.log('\nRQLite test completed!');
  } catch (error) {
    console.log(`RQLite test skipped (server not running at ${rqliteUrl}):`, error.message);
    console.log('To test with RQLite, ensure rqlite is running or set RQLITE_URL environment variable');
  }
}

async function main() {
  console.log('=================================================');
  console.log('Better-Starlite Cross-Platform Drizzle ORM Demo');
  console.log('=================================================');
  console.log('\nThis demo shows how better-starlite works seamlessly');
  console.log('with Drizzle ORM for both local SQLite and RQLite.\n');

  // Test with local SQLite
  await testWithLocalSQLite();

  // Test with RQLite (if available)
  await testWithRQLite();

  console.log('\n=================================================');
  console.log('Demo completed successfully!');
  console.log('=================================================');
}

// Run the demo
main().catch(console.error);
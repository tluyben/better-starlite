/**
 * Cross-platform Drizzle ORM example for Deno
 * This example shows how to use better-starlite with Drizzle ORM in Deno
 * The same patterns work with both local SQLite and remote rqlite databases
 *
 * Run with: deno run --allow-read --allow-write --allow-net examples/drizzle-cross-platform-deno.ts
 */

import { createDatabase } from '../src/async-unified-deno.ts';
// Note: For production use, you would import Drizzle from a CDN or local copy
// import { drizzle } from 'npm:drizzle-orm/better-sqlite3';
// import { sql, eq, and, gte, desc, asc } from 'npm:drizzle-orm';
// import { integer, sqliteTable, text, real, index } from 'npm:drizzle-orm/sqlite-core';

// For this example, we'll use the async database directly without Drizzle
// to demonstrate the cross-platform capabilities

interface User {
  id?: number;
  name: string;
  email: string;
  age?: number;
  created_at?: string;
}

interface Product {
  id?: number;
  name: string;
  description?: string;
  price: number;
  stock?: number;
  category_id?: number;
  created_at?: string;
}

interface Order {
  id?: number;
  user_id: number;
  product_id: number;
  quantity: number;
  total_price: number;
  status?: string;
  order_date?: string;
}

async function setupDatabase(db: any) {
  console.log('Setting up database schema...');

  // Create tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      age INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS email_idx ON users(email)
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS age_idx ON users(age)
  `);

  await db.exec(`
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

  await db.exec(`
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

async function seedData(db: any) {
  console.log('\nSeeding initial data...');

  // Insert users
  const userInsert = await db.prepare('INSERT INTO users (name, email, age) VALUES (?, ?, ?)');

  const users = [
    ['Alice Johnson', 'alice@example.com', 28],
    ['Bob Smith', 'bob@example.com', 35],
    ['Charlie Brown', 'charlie@example.com', 42],
    ['Diana Prince', 'diana@example.com', 31],
    ['Edward Norton', 'edward@example.com', 29],
  ];

  for (const user of users) {
    await userInsert.run(...user);
  }
  console.log(`Inserted ${users.length} users`);

  // Insert products
  const productInsert = await db.prepare(
    'INSERT INTO products (name, description, price, stock, category_id) VALUES (?, ?, ?, ?, ?)'
  );

  const products = [
    ['Laptop', 'High-performance laptop', 1299.99, 10, 1],
    ['Mouse', 'Wireless mouse', 29.99, 50, 2],
    ['Keyboard', 'Mechanical keyboard', 89.99, 30, 2],
    ['Monitor', '27-inch 4K monitor', 499.99, 15, 1],
    ['Headphones', 'Noise-canceling headphones', 199.99, 25, 3],
  ];

  for (const product of products) {
    await productInsert.run(...product);
  }
  console.log(`Inserted ${products.length} products`);

  // Create some orders
  const orderInsert = await db.prepare(
    'INSERT INTO orders (user_id, product_id, quantity, total_price, status) VALUES (?, ?, ?, ?, ?)'
  );

  const orders = [
    [1, 1, 1, 1299.99, 'completed'],
    [2, 2, 2, 59.98, 'completed'],
    [1, 3, 1, 89.99, 'pending'],
    [3, 4, 1, 499.99, 'shipped'],
    [4, 5, 3, 599.97, 'pending'],
  ];

  for (const order of orders) {
    await orderInsert.run(...order);
  }
  console.log(`Inserted ${orders.length} orders`);
}

async function demonstrateQueries(db: any) {
  console.log('\n=== Demonstrating Database Queries ===\n');

  // 1. Simple select all
  console.log('1. All users:');
  const allUsersStmt = await db.prepare('SELECT * FROM users');
  const allUsers = await allUsersStmt.all();
  console.table(allUsers);

  // 2. Select with conditions
  console.log('\n2. Users older than 30:');
  const olderUsersStmt = await db.prepare('SELECT * FROM users WHERE age >= ?');
  const olderUsers = await olderUsersStmt.all(30);
  console.table(olderUsers);

  // 3. Select specific columns
  console.log('\n3. User names and emails:');
  const userContactsStmt = await db.prepare('SELECT name, email FROM users ORDER BY name ASC');
  const userContacts = await userContactsStmt.all();
  console.table(userContacts);

  // 4. Join queries
  console.log('\n4. Orders with user and product details:');
  const orderDetailsStmt = await db.prepare(`
    SELECT
      o.id as orderId,
      u.name as userName,
      u.email as userEmail,
      p.name as productName,
      o.quantity,
      o.total_price as totalPrice,
      o.status
    FROM orders o
    INNER JOIN users u ON o.user_id = u.id
    INNER JOIN products p ON o.product_id = p.id
    ORDER BY o.order_date DESC
  `);
  const orderDetails = await orderDetailsStmt.all();
  console.table(orderDetails);

  // 5. Aggregation
  console.log('\n5. Product inventory value:');
  const inventoryStmt = await db.prepare(`
    SELECT
      name,
      stock,
      price,
      (stock * price) as totalValue
    FROM products
    ORDER BY totalValue DESC
  `);
  const inventoryValue = await inventoryStmt.all();
  console.table(inventoryValue);

  // 6. Update operation
  console.log('\n6. Updating product stock...');
  const updateStmt = await db.prepare('UPDATE products SET stock = stock - 1 WHERE name = ?');
  await updateStmt.run('Laptop');

  const checkStmt = await db.prepare('SELECT * FROM products WHERE name = ?');
  const updatedProduct = await checkStmt.get('Laptop');
  console.log('Updated laptop stock:', updatedProduct.stock);

  // 7. Transaction example
  console.log('\n7. Processing order in transaction...');
  const transaction = await db.transaction(async () => {
    // Check product stock
    const productStmt = await db.prepare('SELECT * FROM products WHERE id = ? LIMIT 1');
    const product = await productStmt.get(2);

    if (product && product.stock > 0) {
      // Create order
      const createOrderStmt = await db.prepare(
        'INSERT INTO orders (user_id, product_id, quantity, total_price, status) VALUES (?, ?, ?, ?, ?)'
      );
      await createOrderStmt.run(5, 2, 1, product.price, 'pending');

      // Update stock
      const updateStockStmt = await db.prepare('UPDATE products SET stock = stock - 1 WHERE id = ?');
      await updateStockStmt.run(2);

      console.log('Order processed successfully');
      return true;
    } else {
      throw new Error('Product out of stock');
    }
  });

  await transaction();

  // 8. Complex query with multiple conditions
  console.log('\n8. Pending orders for expensive products:');
  const complexStmt = await db.prepare(`
    SELECT
      o.id as orderId,
      u.name as userName,
      p.name as productName,
      p.price,
      o.quantity,
      o.total_price as total
    FROM orders o
    INNER JOIN users u ON o.user_id = u.id
    INNER JOIN products p ON o.product_id = p.id
    WHERE o.status = ? AND p.price >= ?
  `);
  const pendingExpensiveOrders = await complexStmt.all('pending', 100);
  console.table(pendingExpensiveOrders);

  // 9. Using prepared statements for performance
  console.log('\n9. Batch insert with prepared statement...');
  const batchInsertStmt = await db.prepare('INSERT INTO users (name, email, age) VALUES (?, ?, ?)');

  const newUsers = [
    ['Frank Miller', 'frank@example.com', 45],
    ['Grace Hopper', 'grace@example.com', 38],
    ['Henry Ford', 'henry@example.com', 52],
  ];

  for (const user of newUsers) {
    await batchInsertStmt.run(...user);
  }
  console.log(`Batch inserted ${newUsers.length} users`);

  // 10. Cleanup
  console.log('\n10. Cleaning up test data...');
  const deleteStmt = await db.prepare('DELETE FROM orders WHERE status = ?');
  const deleteResult = await deleteStmt.run('test');
  console.log(`Deleted ${deleteResult.changes} test orders`);
}

async function testWithLocalSQLite() {
  console.log('\n========================================');
  console.log('Testing with Local SQLite Database');
  console.log('========================================\n');

  const database = await createDatabase(':memory:');

  await setupDatabase(database);
  await seedData(database);
  await demonstrateQueries(database);

  await database.close();
  console.log('\nLocal SQLite test completed!');
}

async function testWithRQLite() {
  console.log('\n========================================');
  console.log('Testing with RQLite Database');
  console.log('========================================\n');

  const rqliteUrl = Deno.env.get('RQLITE_URL') || 'http://localhost:4001';

  try {
    const database = await createDatabase(rqliteUrl);

    await setupDatabase(database);
    await seedData(database);
    await demonstrateQueries(database);

    await database.close();
    console.log('\nRQLite test completed!');
  } catch (error) {
    console.log(`RQLite test skipped (server not running at ${rqliteUrl}):`, error.message);
    console.log('To test with RQLite, ensure rqlite is running or set RQLITE_URL environment variable');
  }
}

async function main() {
  console.log('=================================================');
  console.log('Better-Starlite Cross-Platform Deno Demo');
  console.log('=================================================');
  console.log('\nThis demo shows how better-starlite works seamlessly');
  console.log('in Deno with both local SQLite and RQLite.\n');

  // Test with local SQLite
  await testWithLocalSQLite();

  // Test with RQLite (if available)
  await testWithRQLite();

  console.log('\n=================================================');
  console.log('Demo completed successfully!');
  console.log('=================================================');
}

// Run the demo
if (import.meta.main) {
  main().catch(console.error);
}
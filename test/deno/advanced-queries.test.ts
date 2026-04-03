/**
 * Advanced Query Tests for Deno
 * Tests complex SQL queries and patterns
 */

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { Database } from "../../deno-src/database-deno.ts";

// ============================================
// Window Function Tests
// ============================================

Deno.test({
  name: "Advanced: ROW_NUMBER window function",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, category TEXT, value INTEGER)");

    const insert = db.prepare("INSERT INTO items (category, value) VALUES (?, ?)");
    await insert.run("A", 10);
    await insert.run("A", 20);
    await insert.run("B", 15);
    await insert.run("B", 25);

    const results = await db.prepare(`
      SELECT category, value,
        ROW_NUMBER() OVER (PARTITION BY category ORDER BY value) as row_num
      FROM items
      ORDER BY category, row_num
    `).all();

    assertEquals(results.length, 4);
    assertEquals((results[0] as {row_num: number}).row_num, 1);
    assertEquals((results[1] as {row_num: number}).row_num, 2);

    db.close();
  },
});

Deno.test({
  name: "Advanced: SUM window function",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE sales (id INTEGER PRIMARY KEY, amount INTEGER)");

    const insert = db.prepare("INSERT INTO sales (amount) VALUES (?)");
    await insert.run(100);
    await insert.run(200);
    await insert.run(300);

    const results = await db.prepare(`
      SELECT amount,
        SUM(amount) OVER (ORDER BY id) as running_total
      FROM sales
      ORDER BY id
    `).all();

    assertEquals((results[0] as {running_total: number}).running_total, 100);
    assertEquals((results[1] as {running_total: number}).running_total, 300);
    assertEquals((results[2] as {running_total: number}).running_total, 600);

    db.close();
  },
});

Deno.test({
  name: "Advanced: RANK window function",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE scores (id INTEGER PRIMARY KEY, score INTEGER)");

    const insert = db.prepare("INSERT INTO scores (score) VALUES (?)");
    await insert.run(100);
    await insert.run(100);
    await insert.run(90);

    const results = await db.prepare(`
      SELECT score, RANK() OVER (ORDER BY score DESC) as rank
      FROM scores
    `).all();

    // Two scores of 100 should both be rank 1
    assertEquals((results[0] as {rank: number}).rank, 1);
    assertEquals((results[1] as {rank: number}).rank, 1);
    assertEquals((results[2] as {rank: number}).rank, 3);

    db.close();
  },
});

// ============================================
// CTE (Common Table Expression) Tests
// ============================================

Deno.test({
  name: "Advanced: Simple CTE",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE numbers (n INTEGER)");

    const insert = db.prepare("INSERT INTO numbers (n) VALUES (?)");
    for (let i = 1; i <= 5; i++) {
      await insert.run(i);
    }

    const result = await db.prepare(`
      WITH doubled AS (
        SELECT n, n * 2 as double FROM numbers
      )
      SELECT SUM(double) as total FROM doubled
    `).get();

    assertEquals(result.total, 30); // 2+4+6+8+10

    db.close();
  },
});

Deno.test({
  name: "Advanced: Recursive CTE for fibonacci",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");

    const results = await db.prepare(`
      WITH RECURSIVE fib(n, a, b) AS (
        SELECT 1, 0, 1
        UNION ALL
        SELECT n + 1, b, a + b FROM fib WHERE n < 10
      )
      SELECT a as fib FROM fib
    `).all();

    assertEquals(results.length, 10);
    assertEquals((results[0] as {fib: number}).fib, 0);
    assertEquals((results[1] as {fib: number}).fib, 1);
    assertEquals((results[2] as {fib: number}).fib, 1);
    assertEquals((results[3] as {fib: number}).fib, 2);

    db.close();
  },
});

// ============================================
// Self-Join Tests
// ============================================

Deno.test({
  name: "Advanced: Self-join for hierarchy",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT, manager_id INTEGER)");

    await db.prepare("INSERT INTO employees (id, name, manager_id) VALUES (?, ?, ?)").run(1, "CEO", null);
    await db.prepare("INSERT INTO employees (id, name, manager_id) VALUES (?, ?, ?)").run(2, "Manager", 1);
    await db.prepare("INSERT INTO employees (id, name, manager_id) VALUES (?, ?, ?)").run(3, "Worker", 2);

    const results = await db.prepare(`
      SELECT e.name as employee, m.name as manager
      FROM employees e
      LEFT JOIN employees m ON e.manager_id = m.id
      ORDER BY e.id
    `).all();

    assertEquals(results.length, 3);
    assertEquals((results[0] as {manager: string | null}).manager, null);
    assertEquals((results[1] as {manager: string}).manager, "CEO");
    assertEquals((results[2] as {manager: string}).manager, "Manager");

    db.close();
  },
});

// ============================================
// IN and NOT IN Tests
// ============================================

Deno.test({
  name: "Advanced: IN with subquery",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER);
    `);

    await db.prepare("INSERT INTO users (id, name) VALUES (?, ?)").run(1, "Alice");
    await db.prepare("INSERT INTO users (id, name) VALUES (?, ?)").run(2, "Bob");
    await db.prepare("INSERT INTO users (id, name) VALUES (?, ?)").run(3, "Charlie");
    await db.prepare("INSERT INTO orders (user_id) VALUES (?)").run(1);
    await db.prepare("INSERT INTO orders (user_id) VALUES (?)").run(2);

    const results = await db.prepare(`
      SELECT name FROM users
      WHERE id IN (SELECT user_id FROM orders)
      ORDER BY name
    `).all();

    assertEquals(results.length, 2);

    db.close();
  },
});

Deno.test({
  name: "Advanced: NOT IN with list",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, status TEXT)");

    await db.prepare("INSERT INTO items (status) VALUES (?)").run("active");
    await db.prepare("INSERT INTO items (status) VALUES (?)").run("deleted");
    await db.prepare("INSERT INTO items (status) VALUES (?)").run("pending");

    const results = await db.prepare(`
      SELECT status FROM items WHERE status NOT IN ('deleted', 'pending')
    `).all();

    assertEquals(results.length, 1);
    assertEquals((results[0] as {status: string}).status, "active");

    db.close();
  },
});

// ============================================
// BETWEEN Tests
// ============================================

Deno.test({
  name: "Advanced: BETWEEN for range",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, value INTEGER)");

    const insert = db.prepare("INSERT INTO items (value) VALUES (?)");
    for (let i = 1; i <= 10; i++) {
      await insert.run(i);
    }

    const results = await db.prepare(`
      SELECT value FROM items WHERE value BETWEEN 3 AND 7 ORDER BY value
    `).all();

    assertEquals(results.length, 5);
    assertEquals((results[0] as {value: number}).value, 3);
    assertEquals((results[4] as {value: number}).value, 7);

    db.close();
  },
});

// ============================================
// GROUP_CONCAT Tests
// ============================================

Deno.test({
  name: "Advanced: GROUP_CONCAT",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE tags (id INTEGER PRIMARY KEY, item_id INTEGER, tag TEXT)");

    await db.prepare("INSERT INTO tags (item_id, tag) VALUES (?, ?)").run(1, "red");
    await db.prepare("INSERT INTO tags (item_id, tag) VALUES (?, ?)").run(1, "blue");
    await db.prepare("INSERT INTO tags (item_id, tag) VALUES (?, ?)").run(1, "green");

    const result = await db.prepare(`
      SELECT item_id, GROUP_CONCAT(tag, ', ') as tags
      FROM tags
      GROUP BY item_id
    `).get();

    assertExists(result.tags);
    // Tags should be comma-separated
    assertEquals(result.tags.includes(","), true);

    db.close();
  },
});

// ============================================
// Nested Subquery Tests
// ============================================

Deno.test({
  name: "Advanced: Nested subqueries",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE products (id INTEGER PRIMARY KEY, category TEXT, price INTEGER)");

    await db.prepare("INSERT INTO products (category, price) VALUES (?, ?)").run("A", 100);
    await db.prepare("INSERT INTO products (category, price) VALUES (?, ?)").run("A", 200);
    await db.prepare("INSERT INTO products (category, price) VALUES (?, ?)").run("B", 150);

    const result = await db.prepare(`
      SELECT category, price FROM products p
      WHERE price = (
        SELECT MAX(price) FROM products
        WHERE category = p.category
      )
      ORDER BY category
    `).all();

    assertEquals(result.length, 2);
    assertEquals((result[0] as {price: number}).price, 200);
    assertEquals((result[1] as {price: number}).price, 150);

    db.close();
  },
});

// ============================================
// IFNULL and NULLIF Extended Tests
// ============================================

Deno.test({
  name: "Advanced: IFNULL function",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)");

    await db.prepare("INSERT INTO items (name) VALUES (?)").run(null);

    const result = await db.prepare(`
      SELECT IFNULL(name, 'Unknown') as display FROM items
    `).get();

    assertEquals(result.display, "Unknown");

    db.close();
  },
});

// ============================================
// Aliased Table Tests
// ============================================

Deno.test({
  name: "Advanced: Multiple table aliases",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER, product TEXT);
    `);

    await db.prepare("INSERT INTO users (id, name) VALUES (?, ?)").run(1, "Alice");
    await db.prepare("INSERT INTO orders (user_id, product) VALUES (?, ?)").run(1, "Widget");

    const result = await db.prepare(`
      SELECT u.name, o.product
      FROM users AS u
      INNER JOIN orders AS o ON u.id = o.user_id
    `).get();

    assertEquals(result.name, "Alice");
    assertEquals(result.product, "Widget");

    db.close();
  },
});

// ============================================
// EXCEPT and INTERSECT Tests
// ============================================

Deno.test({
  name: "Advanced: EXCEPT query",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE all_items (name TEXT);
      CREATE TABLE sold_items (name TEXT);
    `);

    await db.prepare("INSERT INTO all_items (name) VALUES (?)").run("A");
    await db.prepare("INSERT INTO all_items (name) VALUES (?)").run("B");
    await db.prepare("INSERT INTO all_items (name) VALUES (?)").run("C");
    await db.prepare("INSERT INTO sold_items (name) VALUES (?)").run("B");

    const results = await db.prepare(`
      SELECT name FROM all_items
      EXCEPT
      SELECT name FROM sold_items
      ORDER BY name
    `).all();

    assertEquals(results.length, 2);
    assertEquals((results[0] as {name: string}).name, "A");
    assertEquals((results[1] as {name: string}).name, "C");

    db.close();
  },
});

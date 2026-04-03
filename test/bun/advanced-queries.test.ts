/**
 * Advanced Query Tests for Bun
 * Tests complex SQL queries using Bun's native SQLite
 */

import { test, expect, describe, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

describe("Window Functions", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("ROW_NUMBER", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, category TEXT, value INTEGER)");
    const insert = db.prepare("INSERT INTO items (category, value) VALUES (?, ?)");
    insert.run("A", 10);
    insert.run("A", 20);
    insert.run("B", 15);
    insert.run("B", 25);

    const results = db.prepare(`
      SELECT category, value,
        ROW_NUMBER() OVER (PARTITION BY category ORDER BY value) as row_num
      FROM items
      ORDER BY category, row_num
    `).all() as any[];

    expect(results.length).toBe(4);
    expect(results[0].row_num).toBe(1);
    expect(results[1].row_num).toBe(2);
  });

  test("SUM window function", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE sales (id INTEGER PRIMARY KEY, amount INTEGER)");
    const insert = db.prepare("INSERT INTO sales (amount) VALUES (?)");
    insert.run(100);
    insert.run(200);
    insert.run(300);

    const results = db.prepare(`
      SELECT amount,
        SUM(amount) OVER (ORDER BY id) as running_total
      FROM sales
      ORDER BY id
    `).all() as any[];

    expect(results[0].running_total).toBe(100);
    expect(results[1].running_total).toBe(300);
    expect(results[2].running_total).toBe(600);
  });

  test("RANK", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE scores (id INTEGER PRIMARY KEY, score INTEGER)");
    const insert = db.prepare("INSERT INTO scores (score) VALUES (?)");
    insert.run(100);
    insert.run(100);
    insert.run(90);

    const results = db.prepare(`
      SELECT score, RANK() OVER (ORDER BY score DESC) as rank
      FROM scores
    `).all() as any[];

    expect(results[0].rank).toBe(1);
    expect(results[1].rank).toBe(1);
    expect(results[2].rank).toBe(3);
  });
});

describe("Common Table Expressions", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("simple CTE", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE numbers (n INTEGER)");
    const insert = db.prepare("INSERT INTO numbers (n) VALUES (?)");
    for (let i = 1; i <= 5; i++) {
      insert.run(i);
    }

    const result = db.prepare(`
      WITH doubled AS (
        SELECT n, n * 2 as double FROM numbers
      )
      SELECT SUM(double) as total FROM doubled
    `).get() as { total: number };

    expect(result.total).toBe(30);
  });

  test("recursive CTE for fibonacci", () => {
    db = new Database(":memory:");

    const results = db.prepare(`
      WITH RECURSIVE fib(n, a, b) AS (
        SELECT 1, 0, 1
        UNION ALL
        SELECT n + 1, b, a + b FROM fib WHERE n < 10
      )
      SELECT a as fib FROM fib
    `).all() as any[];

    expect(results.length).toBe(10);
    expect(results[0].fib).toBe(0);
    expect(results[1].fib).toBe(1);
    expect(results[2].fib).toBe(1);
    expect(results[3].fib).toBe(2);
  });
});

describe("Self-Joins", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("self-join for hierarchy", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT, manager_id INTEGER)");

    db.prepare("INSERT INTO employees (id, name, manager_id) VALUES (?, ?, ?)").run(1, "CEO", null);
    db.prepare("INSERT INTO employees (id, name, manager_id) VALUES (?, ?, ?)").run(2, "Manager", 1);
    db.prepare("INSERT INTO employees (id, name, manager_id) VALUES (?, ?, ?)").run(3, "Worker", 2);

    const results = db.prepare(`
      SELECT e.name as employee, m.name as manager
      FROM employees e
      LEFT JOIN employees m ON e.manager_id = m.id
      ORDER BY e.id
    `).all() as any[];

    expect(results.length).toBe(3);
    expect(results[0].manager).toBeNull();
    expect(results[1].manager).toBe("CEO");
    expect(results[2].manager).toBe("Manager");
  });
});

describe("IN and NOT IN", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("IN with subquery", () => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER);
    `);

    db.prepare("INSERT INTO users (id, name) VALUES (?, ?)").run(1, "Alice");
    db.prepare("INSERT INTO users (id, name) VALUES (?, ?)").run(2, "Bob");
    db.prepare("INSERT INTO users (id, name) VALUES (?, ?)").run(3, "Charlie");
    db.prepare("INSERT INTO orders (user_id) VALUES (?)").run(1);
    db.prepare("INSERT INTO orders (user_id) VALUES (?)").run(2);

    const results = db.prepare(`
      SELECT name FROM users
      WHERE id IN (SELECT user_id FROM orders)
      ORDER BY name
    `).all() as any[];

    expect(results.length).toBe(2);
  });

  test("NOT IN with list", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, status TEXT)");

    db.prepare("INSERT INTO items (status) VALUES (?)").run("active");
    db.prepare("INSERT INTO items (status) VALUES (?)").run("deleted");
    db.prepare("INSERT INTO items (status) VALUES (?)").run("pending");

    const results = db.prepare(`
      SELECT status FROM items WHERE status NOT IN ('deleted', 'pending')
    `).all() as any[];

    expect(results.length).toBe(1);
    expect(results[0].status).toBe("active");
  });
});

describe("BETWEEN", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("BETWEEN for range", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, value INTEGER)");
    const insert = db.prepare("INSERT INTO items (value) VALUES (?)");
    for (let i = 1; i <= 10; i++) {
      insert.run(i);
    }

    const results = db.prepare(`
      SELECT value FROM items WHERE value BETWEEN 3 AND 7 ORDER BY value
    `).all() as any[];

    expect(results.length).toBe(5);
    expect(results[0].value).toBe(3);
    expect(results[4].value).toBe(7);
  });
});

describe("GROUP_CONCAT", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("GROUP_CONCAT", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE tags (id INTEGER PRIMARY KEY, item_id INTEGER, tag TEXT)");

    db.prepare("INSERT INTO tags (item_id, tag) VALUES (?, ?)").run(1, "red");
    db.prepare("INSERT INTO tags (item_id, tag) VALUES (?, ?)").run(1, "blue");
    db.prepare("INSERT INTO tags (item_id, tag) VALUES (?, ?)").run(1, "green");

    const result = db.prepare(`
      SELECT item_id, GROUP_CONCAT(tag, ', ') as tags
      FROM tags
      GROUP BY item_id
    `).get() as any;

    expect(result.tags).toBeDefined();
    expect(result.tags.includes(",")).toBe(true);
  });
});

describe("Nested Subqueries", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("nested subqueries", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE products (id INTEGER PRIMARY KEY, category TEXT, price INTEGER)");

    db.prepare("INSERT INTO products (category, price) VALUES (?, ?)").run("A", 100);
    db.prepare("INSERT INTO products (category, price) VALUES (?, ?)").run("A", 200);
    db.prepare("INSERT INTO products (category, price) VALUES (?, ?)").run("B", 150);

    const results = db.prepare(`
      SELECT category, price FROM products p
      WHERE price = (
        SELECT MAX(price) FROM products
        WHERE category = p.category
      )
      ORDER BY category
    `).all() as any[];

    expect(results.length).toBe(2);
    expect(results[0].price).toBe(200);
    expect(results[1].price).toBe(150);
  });
});

describe("IFNULL", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("IFNULL function", () => {
    db = new Database(":memory:");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)");
    db.prepare("INSERT INTO items (name) VALUES (?)").run(null);

    const result = db.prepare(`
      SELECT IFNULL(name, 'Unknown') as display FROM items
    `).get() as any;

    expect(result.display).toBe("Unknown");
  });
});

describe("Aliased Tables", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("multiple table aliases", () => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER, product TEXT);
    `);

    db.prepare("INSERT INTO users (id, name) VALUES (?, ?)").run(1, "Alice");
    db.prepare("INSERT INTO orders (user_id, product) VALUES (?, ?)").run(1, "Widget");

    const result = db.prepare(`
      SELECT u.name, o.product
      FROM users AS u
      INNER JOIN orders AS o ON u.id = o.user_id
    `).get() as any;

    expect(result.name).toBe("Alice");
    expect(result.product).toBe("Widget");
  });
});

describe("EXCEPT and INTERSECT", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("EXCEPT query", () => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE all_items (name TEXT);
      CREATE TABLE sold_items (name TEXT);
    `);

    db.prepare("INSERT INTO all_items (name) VALUES (?)").run("A");
    db.prepare("INSERT INTO all_items (name) VALUES (?)").run("B");
    db.prepare("INSERT INTO all_items (name) VALUES (?)").run("C");
    db.prepare("INSERT INTO sold_items (name) VALUES (?)").run("B");

    const results = db.prepare(`
      SELECT name FROM all_items
      EXCEPT
      SELECT name FROM sold_items
      ORDER BY name
    `).all() as any[];

    expect(results.length).toBe(2);
    expect(results[0].name).toBe("A");
    expect(results[1].name).toBe("C");
  });

  test("INTERSECT query", () => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE set_a (name TEXT);
      CREATE TABLE set_b (name TEXT);
    `);

    db.prepare("INSERT INTO set_a (name) VALUES (?)").run("A");
    db.prepare("INSERT INTO set_a (name) VALUES (?)").run("B");
    db.prepare("INSERT INTO set_b (name) VALUES (?)").run("B");
    db.prepare("INSERT INTO set_b (name) VALUES (?)").run("C");

    const results = db.prepare(`
      SELECT name FROM set_a
      INTERSECT
      SELECT name FROM set_b
    `).all() as any[];

    expect(results.length).toBe(1);
    expect(results[0].name).toBe("B");
  });
});

describe("Complex Joins", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("LEFT JOIN with aggregation", () => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE employees (id INTEGER PRIMARY KEY, dept_id INTEGER, name TEXT);
    `);

    db.prepare("INSERT INTO departments (id, name) VALUES (?, ?)").run(1, "Engineering");
    db.prepare("INSERT INTO departments (id, name) VALUES (?, ?)").run(2, "Sales");
    db.prepare("INSERT INTO employees (dept_id, name) VALUES (?, ?)").run(1, "Alice");
    db.prepare("INSERT INTO employees (dept_id, name) VALUES (?, ?)").run(1, "Bob");

    const results = db.prepare(`
      SELECT d.name as dept, COUNT(e.id) as emp_count
      FROM departments d
      LEFT JOIN employees e ON d.id = e.dept_id
      GROUP BY d.id
      ORDER BY d.name
    `).all() as any[];

    expect(results.length).toBe(2);
    expect(results[0].emp_count).toBe(2);
    expect(results[1].emp_count).toBe(0);
  });
});

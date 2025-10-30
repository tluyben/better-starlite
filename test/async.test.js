const { AsyncDatabase } = require('../dist/index');
const fs = require('fs');

describe('Async SQLite functionality', () => {
  afterEach(() => {
    // Clean up test databases after each test
    ['test-async.db', 'test-async.db-wal', 'test-async.db-shm', 'test-nowal.db'].forEach(file => {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    });
  });

  test('Async local SQLite database with WAL mode', async () => {
    const db = new AsyncDatabase('test-async.db');

    // Create table
    await db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL
      )
    `);

    // Verify WAL mode is enabled by default
    const journalMode = await db.pragma('journal_mode');
    expect(journalMode[0].journal_mode).toBe('wal');

    // Test prepare and run
    const insert = await db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
    const result = await insert.run('Alice', 'alice@test.com');
    expect(result.changes).toBe(1);
    expect(result.lastInsertRowid).toBe(1);

    // Test get
    const select = await db.prepare('SELECT * FROM users WHERE email = ?');
    const user = await select.get('alice@test.com');
    expect(user.name).toBe('Alice');

    // Test all
    await insert.run('Bob', 'bob@test.com');
    const selectAll = await db.prepare('SELECT * FROM users');
    const users = await selectAll.all();
    expect(users.length).toBe(2);

    // Test async transaction
    const insertMany = await db.transaction(async (users) => {
      for (const user of users) {
        await insert.run(user.name, user.email);
      }
      return users.length;
    });

    const count = await insertMany([
      { name: 'Charlie', email: 'charlie@test.com' },
      { name: 'Diana', email: 'diana@test.com' }
    ]);

    expect(count).toBe(2);

    const allUsers = await selectAll.all();
    expect(allUsers.length).toBe(4);

    // Test iterator
    const iterator = await selectAll.iterate();
    let iterCount = 0;
    for await (const row of iterator) {
      iterCount++;
    }
    expect(iterCount).toBe(4);

    await db.close();
  });

  test('Async memory database', async () => {
    const memDb = new AsyncDatabase(':memory:');
    await memDb.exec('CREATE TABLE test (id INTEGER)');
    const memStmt = await memDb.prepare('INSERT INTO test VALUES (?)');
    await memStmt.run(1);
    const memSelect = await memDb.prepare('SELECT * FROM test');
    const memResult = await memSelect.get();
    expect(memResult.id).toBe(1);
    await memDb.close();
  });

  test('Async database with WAL disabled', async () => {
    const noWalDb = new AsyncDatabase('test-nowal.db', { disableWAL: true });
    const noWalMode = await noWalDb.pragma('journal_mode');
    expect(noWalMode[0].journal_mode).not.toBe('wal');
    await noWalDb.close();
  });
});

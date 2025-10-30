const Database = require('../dist/index').default;
const fs = require('fs');

describe('Basic SQLite functionality', () => {
  afterEach(() => {
    // Clean up test databases after each test
    ['test-basic.db', 'test-basic.db-wal', 'test-basic.db-shm', 'test-nowal.db'].forEach(file => {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    });
  });

  test('Local SQLite database with WAL mode', () => {
    const db = new Database('test-basic.db');

    // Create table
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL
      )
    `);

    // Verify WAL mode is enabled by default
    const journalMode = db.pragma('journal_mode');
    expect(journalMode[0].journal_mode).toBe('wal');

    // Test prepare and run
    const insert = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
    const result = insert.run('Alice', 'alice@test.com');
    expect(result.changes).toBe(1);
    expect(result.lastInsertRowid).toBe(1);

    // Test get
    const select = db.prepare('SELECT * FROM users WHERE email = ?');
    const user = select.get('alice@test.com');
    expect(user.name).toBe('Alice');

    // Test all
    insert.run('Bob', 'bob@test.com');
    const selectAll = db.prepare('SELECT * FROM users');
    const users = selectAll.all();
    expect(users.length).toBe(2);

    // Test transaction
    const insertMany = db.transaction((users) => {
      for (const user of users) {
        insert.run(user.name, user.email);
      }
    });

    insertMany([
      { name: 'Charlie', email: 'charlie@test.com' },
      { name: 'Diana', email: 'diana@test.com' }
    ]);

    const allUsers = selectAll.all();
    expect(allUsers.length).toBe(4);

    db.close();
  });

  test('Memory database without WAL', () => {
    const memDb = new Database(':memory:');
    memDb.exec('CREATE TABLE test (id INTEGER)');
    memDb.prepare('INSERT INTO test VALUES (?)').run(1);
    const memResult = memDb.prepare('SELECT * FROM test').get();
    expect(memResult.id).toBe(1);
    memDb.close();
  });

  test('File database with WAL disabled', () => {
    const noWalDb = new Database('test-nowal.db', { disableWAL: true });
    const noWalMode = noWalDb.pragma('journal_mode');
    expect(noWalMode[0].journal_mode).not.toBe('wal');
    noWalDb.close();
  });
});

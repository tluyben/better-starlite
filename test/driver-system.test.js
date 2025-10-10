/**
 * Tests for the new driver system
 */

const { Database, DriverRegistry } = require('../src/database.js');
const { createDummyDriver } = require('../src/drivers/dummy-driver.js');
const { createSqliteNodeDriver } = require('../src/drivers/sqlite-node-driver.js');
const { createRqliteDriver } = require('../src/drivers/rqlite-driver.js');

describe('Driver System', () => {
  beforeEach(() => {
    // Clear registry before each test
    DriverRegistry.clear();
  });

  describe('Driver Registration', () => {
    test('should register and retrieve a driver', () => {
      const driver = createDummyDriver();
      DriverRegistry.register('dummy', driver);

      const retrieved = DriverRegistry.get('dummy');
      expect(retrieved).toBe(driver);
    });

    test('should list registered drivers', () => {
      const dummyDriver = createDummyDriver();
      DriverRegistry.register('dummy', dummyDriver);

      const list = DriverRegistry.list();
      expect(list).toHaveLength(1);
      expect(list[0]).toEqual({
        name: 'dummy',
        available: true,
        features: {
          backup: true,
          loadExtension: true,
          customFunctions: true,
          customAggregates: true,
          transactions: true,
          wal: true
        }
      });
    });

    test('should set and get default driver', () => {
      const driver = createDummyDriver();
      DriverRegistry.register('dummy', driver);
      DriverRegistry.setDefault('dummy');

      const defaultDriver = DriverRegistry.getDefault();
      expect(defaultDriver).toBe(driver);
    });

    test('should throw error for unknown driver', () => {
      expect(() => {
        DriverRegistry.setDefault('unknown');
      }).toThrow('Driver "unknown" not registered');
    });
  });

  describe('Database with Drivers', () => {
    beforeEach(() => {
      // Register dummy driver for testing
      const dummyDriver = createDummyDriver();
      DriverRegistry.register('dummy', dummyDriver);
      DriverRegistry.setDefault('dummy');
    });

    test('should create database with default driver', () => {
      const db = new Database(':memory:');
      expect(db.driver).toBe('dummy');
      expect(db.open).toBe(true);
    });

    test('should create database with specified driver', () => {
      const db = new Database(':memory:', { driver: 'dummy' });
      expect(db.driver).toBe('dummy');
    });

    test('should throw error for unavailable driver', () => {
      // Register a driver that's not available
      const unavailableDriver = {
        name: 'unavailable',
        features: {},
        isAvailable: () => false,
        createDatabase: () => { throw new Error('Should not be called'); }
      };
      DriverRegistry.register('unavailable', unavailableDriver);

      expect(() => {
        new Database(':memory:', { driver: 'unavailable' });
      }).toThrow('Driver "unavailable" is not available in this environment');
    });

    test('should execute basic operations with dummy driver', () => {
      const db = new Database(':memory:', { driver: 'dummy' });

      // Test exec
      db.exec('CREATE TABLE test (id INTEGER, name TEXT)');

      // Test prepare and run
      const insertStmt = db.prepare('INSERT INTO test VALUES (?, ?)');
      const result = insertStmt.run(1, 'Test');
      expect(result.changes).toBeGreaterThan(0);

      // Test prepare and get
      const selectStmt = db.prepare('SELECT * FROM users WHERE id = ?');
      const row = selectStmt.get(1);
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('name');

      // Test prepare and all
      const allStmt = db.prepare('SELECT * FROM users');
      const rows = allStmt.all();
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBeGreaterThan(0);
    });

    test('should support transactions with dummy driver', () => {
      const db = new Database(':memory:', { driver: 'dummy' });

      const transactionFn = db.transaction((value) => {
        db.exec(`INSERT INTO test VALUES (${value})`);
        return value * 2;
      });

      const result = transactionFn(5);
      expect(result).toBe(10);
      expect(db.inTransaction).toBe(false);
    });

    test('should support pragmas with dummy driver', () => {
      const db = new Database(':memory:', { driver: 'dummy' });

      const walMode = db.pragma('journal_mode', { simple: true });
      expect(walMode).toBe('wal');

      const pragmaList = db.pragma('journal_mode');
      expect(Array.isArray(pragmaList)).toBe(true);
    });
  });

  describe('SQLite Node Driver', () => {
    test('should register if available', () => {
      const driver = createSqliteNodeDriver();

      if (driver.isAvailable()) {
        DriverRegistry.register('sqlite-node', driver);
        expect(DriverRegistry.get('sqlite-node')).toBe(driver);

        // Test creating a database
        const db = new Database(':memory:', { driver: 'sqlite-node' });
        expect(db.driver).toBe('sqlite-node');

        // Run a real SQLite query
        db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
        const stmt = db.prepare('INSERT INTO test (value) VALUES (?)');
        const result = stmt.run('test value');
        expect(result.changes).toBe(1);
        expect(result.lastInsertRowid).toBe(1);

        const selectStmt = db.prepare('SELECT * FROM test WHERE id = ?');
        const row = selectStmt.get(1);
        expect(row).toEqual({ id: 1, value: 'test value' });

        db.close();
      } else {
        // Skip test if not in Node.js environment
        expect(driver.isAvailable()).toBe(false);
      }
    });
  });

  describe('RQLite Driver', () => {
    test('should identify HTTP URLs correctly', () => {
      const driver = createRqliteDriver();
      DriverRegistry.register('rqlite', driver);

      if (driver.isAvailable()) {
        // Should auto-detect RQLite for HTTP URLs
        expect(() => {
          new Database('http://localhost:4001', { driver: 'auto' });
        }).not.toThrow(); // Won't actually connect, but should select the right driver
      }
    });
  });

  describe('Auto Registration', () => {
    test('should work with autoRegisterDriversSync', () => {
      const { autoRegisterDriversSync } = require('../src/drivers');

      // Register only dummy driver
      autoRegisterDriversSync(['dummy']);

      const list = DriverRegistry.list();
      const dummyDriver = list.find(d => d.name === 'dummy');
      expect(dummyDriver).toBeDefined();
      expect(dummyDriver.available).toBe(true);
    });

    test('should work with autoRegisterDrivers async', async () => {
      const { autoRegisterDrivers } = require('../src/drivers');

      // Register all available drivers
      await autoRegisterDrivers();

      const list = DriverRegistry.list();
      expect(list.length).toBeGreaterThan(0);

      // At minimum, dummy driver should be registered
      const dummyDriver = list.find(d => d.name === 'dummy');
      expect(dummyDriver).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should provide helpful error when no drivers registered', () => {
      expect(() => {
        new Database(':memory:');
      }).toThrow(/No default driver available/);
    });

    test('should provide helpful error for unknown driver', () => {
      DriverRegistry.register('dummy', createDummyDriver());

      expect(() => {
        new Database(':memory:', { driver: 'unknown' });
      }).toThrow(/Driver "unknown" not found/);
    });
  });

  describe('Driver Features', () => {
    test('should correctly report driver features', () => {
      const dummyDriver = createDummyDriver();
      expect(dummyDriver.features).toEqual({
        backup: true,
        loadExtension: true,
        customFunctions: true,
        customAggregates: true,
        transactions: true,
        wal: true
      });

      const rqliteDriver = createRqliteDriver();
      expect(rqliteDriver.features).toEqual({
        backup: false,
        loadExtension: false,
        customFunctions: false,
        customAggregates: false,
        transactions: true,
        wal: false
      });
    });

    test('should handle unsupported features gracefully', () => {
      const driver = createRqliteDriver();
      if (driver.isAvailable()) {
        DriverRegistry.register('rqlite', driver);

        // This would normally connect to a real RQLite instance
        // For testing, we just verify the driver doesn't crash
        expect(() => {
          const db = new Database('http://localhost:4001', { driver: 'rqlite' });
          db.function('myFunc', () => {}); // Should not crash, just warn
          db.aggregate('myAgg', {}); // Should not crash, just warn
          db.loadExtension('ext.so'); // Should not crash, just warn
        }).not.toThrow();
      }
    });
  });
});
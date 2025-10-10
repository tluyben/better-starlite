/**
 * Tests to ensure the library doesn't cause compilation errors
 * when imported in different environments
 */

describe('Compilation Safety', () => {
  beforeEach(() => {
    // Clear module cache to test fresh imports
    Object.keys(require.cache).forEach(key => {
      if (key.includes('better-starlite')) {
        delete require.cache[key];
      }
    });
  });

  test('safe index should not import any drivers', () => {
    // This should NOT throw even if better-sqlite3 is not installed
    const safeImport = () => require('../src/index-safe');

    expect(safeImport).not.toThrow();

    const module = safeImport();
    expect(module.Database).toBeDefined();
    expect(module.DriverRegistry).toBeDefined();

    // Registry should be empty - no drivers auto-loaded
    const { DriverRegistry } = module;
    expect(DriverRegistry.list()).toHaveLength(0);
  });

  test('main database class should not have driver dependencies', () => {
    // Import just the database class
    const databaseImport = () => require('../src/database');

    expect(databaseImport).not.toThrow();

    const { Database, DriverRegistry } = databaseImport();

    // Should throw when trying to use without drivers
    expect(() => {
      new Database('test.db');
    }).toThrow(/No default driver available/);
  });

  test('driver interface should be pure TypeScript', () => {
    // Import just the interface
    const interfaceImport = () => require('../src/drivers/driver-interface');

    expect(interfaceImport).not.toThrow();

    const module = interfaceImport();
    expect(module.DriverRegistry).toBeDefined();
    expect(module.DriverRegistry.list()).toEqual([]);
  });

  test('drivers should not be imported unless explicitly requested', () => {
    const { DriverRegistry } = require('../src/drivers/driver-interface');

    // Registry starts empty
    expect(DriverRegistry.list()).toHaveLength(0);

    // Only when we explicitly import a driver...
    const { createDummyDriver } = require('../src/drivers/dummy-driver');

    // ...and register it...
    DriverRegistry.register('dummy', createDummyDriver());

    // ...does it become available
    expect(DriverRegistry.list()).toHaveLength(1);
    expect(DriverRegistry.list()[0].name).toBe('dummy');
  });

  test('simulated React Native environment (no better-sqlite3)', () => {
    // Simulate React Native by hiding Node.js indicators
    const originalProcess = global.process;
    global.process = { versions: {} }; // No node version

    try {
      // Clear and reload
      Object.keys(require.cache).forEach(key => {
        if (key.includes('better-starlite')) {
          delete require.cache[key];
        }
      });

      // This should work even without better-sqlite3
      const { Database, DriverRegistry } = require('../src/index-safe');

      // Register a mock React Native driver
      const mockRNDriver = {
        name: 'react-native',
        features: {
          backup: false,
          loadExtension: false,
          customFunctions: false,
          customAggregates: false,
          transactions: true,
          wal: false
        },
        isAvailable: () => true,
        createDatabase: () => {
          return {
            prepare: () => ({ run: () => {}, get: () => {}, all: () => [] }),
            exec: () => {},
            close: () => {},
            // ... minimal implementation
          };
        }
      };

      DriverRegistry.register('react-native', mockRNDriver);

      // Should work with the mock driver
      const db = new Database('app.db', { driver: 'react-native' });
      expect(db.driver).toBe('react-native');

    } finally {
      global.process = originalProcess;
    }
  });

  test('dummy driver should work without any dependencies', () => {
    const { Database, DriverRegistry } = require('../src/index-safe');
    const { createDummyDriver } = require('../src/drivers/dummy-driver');

    DriverRegistry.clear();
    DriverRegistry.register('dummy', createDummyDriver());

    const db = new Database(':memory:', { driver: 'dummy' });

    // Should work without real database
    const stmt = db.prepare('SELECT * FROM users');
    const users = stmt.all();
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThan(0);
    expect(users[0]).toHaveProperty('name');
  });

  test('package exports should provide safe paths', () => {
    // Clear registry first to ensure clean state
    const { DriverRegistry } = require('../src/drivers/driver-interface');
    DriverRegistry.clear();

    // Test that different import paths work correctly

    // Safe main entry - no drivers
    const main = require('../src/index-safe');
    expect(main.DriverRegistry.list()).toHaveLength(0);

    // Driver interface only - no implementations
    const driverInterface = require('../src/drivers/driver-interface');
    expect(driverInterface.DriverRegistry).toBeDefined();

    // Individual driver imports should work
    const dummyDriver = require('../src/drivers/dummy-driver');
    expect(dummyDriver.createDummyDriver).toBeDefined();
    expect(dummyDriver.DummyDriver).toBeDefined();
  });

  describe('Platform-specific entry points', () => {
    test('Node.js entry should only load in Node', () => {
      if (typeof process !== 'undefined' && process.versions?.node) {
        // In Node.js environment
        const nodeEntry = require('../src/node');
        const { DriverRegistry } = nodeEntry;

        // Should have auto-registered Node drivers
        const drivers = DriverRegistry.list();
        const nodeDriver = drivers.find(d => d.name === 'sqlite-node');

        if (nodeDriver) {
          expect(nodeDriver.available).toBe(true);
        }
      }
    });

    test('Browser entry should only load web-safe drivers', () => {
      // Clear registry from previous tests
      const { DriverRegistry: Registry } = require('../src/drivers/driver-interface');
      Registry.clear();

      // Simulate browser environment
      global.window = {};
      global.fetch = () => {};

      try {
        Object.keys(require.cache).forEach(key => {
          if (key.includes('better-starlite')) {
            delete require.cache[key];
          }
        });

        const browserEntry = require('../src/browser');
        const { DriverRegistry } = browserEntry;

        const drivers = DriverRegistry.list();

        // Should NOT have sqlite-node driver
        const nodeDriver = drivers.find(d => d.name === 'sqlite-node');
        expect(nodeDriver).toBeUndefined();

        // Should have web-safe drivers
        const rqliteDriver = drivers.find(d => d.name === 'rqlite');
        if (rqliteDriver) {
          expect(rqliteDriver.available).toBe(true);
        }

      } finally {
        delete global.window;
        delete global.fetch;
      }
    });
  });

  describe('Error messages', () => {
    test('should provide helpful error when no driver registered', () => {
      const { Database, DriverRegistry } = require('../src/index-safe');
      DriverRegistry.clear();

      expect(() => {
        new Database('test.db');
      }).toThrow(/No default driver available.*Please register a driver first/s);
    });

    test('should provide helpful error for missing driver', () => {
      const { Database, DriverRegistry } = require('../src/index-safe');
      DriverRegistry.clear();

      // Register one driver
      const { createDummyDriver } = require('../src/drivers/dummy-driver');
      DriverRegistry.register('dummy', createDummyDriver());

      expect(() => {
        new Database('test.db', { driver: 'sqlite-node' });
      }).toThrow(/Driver "sqlite-node" not found/);
    });
  });
});
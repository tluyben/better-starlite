# CR-SQLite Quick Start Guide

Get up and running with CR-SQLite in 5 minutes!

## Installation

```bash
npm install better-starlite @vlcn.io/crsqlite-wasm
```

## Basic Setup

```javascript
const { DriverRegistry } = require('better-starlite/drivers');
const { createCrSqliteDriver } = require('better-starlite/drivers/cr-sqlite-driver');

async function setup() {
  // 1. Create and initialize driver
  const driver = await createCrSqliteDriver();

  // 2. Register driver
  DriverRegistry.register('cr-sqlite', driver);

  // 3. Create database
  const db = driver.createDatabase('myapp.db', {
    siteId: 'user-device-123'
  });

  return db;
}
```

## Basic CRUD

```javascript
const db = await setup();

// Create table
db.exec(`
  CREATE TABLE tasks (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    done INTEGER DEFAULT 0
  )
`);

// Insert
const insert = db.prepare('INSERT INTO tasks (title) VALUES (?)');
insert.run('Buy groceries');
insert.run('Write docs');

// Select all
const all = db.prepare('SELECT * FROM tasks').all();
console.log(all);

// Select one
const one = db.prepare('SELECT * FROM tasks WHERE id = ?').get(1);
console.log(one);

// Update
const update = db.prepare('UPDATE tasks SET done = 1 WHERE id = ?');
update.run(1);

// Delete
const del = db.prepare('DELETE FROM tasks WHERE id = ?');
del.run(2);
```

## Enable Sync

```javascript
// Enable CRDT tracking
db.exec("SELECT crsql_as_crr('tasks')");

// Get changes for sync
const changes = db.getChanges();
console.log(`${changes.length} changes to sync`);

// Send to server
await fetch('/api/sync', {
  method: 'POST',
  body: JSON.stringify(changes)
});
```

## Apply Remote Changes

```javascript
// Fetch changes from server
const response = await fetch('/api/sync');
const remoteChanges = await response.json();

// Apply locally
db.applyChanges(remoteChanges);
console.log('Sync complete!');
```

## Complete Example

```javascript
const { DriverRegistry } = require('better-starlite/drivers');
const { createCrSqliteDriver } = require('better-starlite/drivers/cr-sqlite-driver');

async function main() {
  // Setup
  const driver = await createCrSqliteDriver();
  DriverRegistry.register('cr-sqlite', driver);

  const db = driver.createDatabase(':memory:', {
    siteId: 'demo-node-1'
  });

  // Schema
  db.exec(`
    CREATE TABLE notes (
      id INTEGER PRIMARY KEY,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Enable sync
  db.exec("SELECT crsql_as_crr('notes')");

  // Insert data
  const insert = db.prepare('INSERT INTO notes (content) VALUES (?)');
  insert.run('First note');
  insert.run('Second note');

  // Query
  const notes = db.prepare('SELECT * FROM notes').all();
  console.log('Notes:', notes);

  // Get changes
  const changes = db.getChanges();
  console.log('Changes:', changes);

  // Close
  db.close();
}

main().catch(console.error);
```

## Platform-Specific Examples

### Node.js
```javascript
const { createCrSqliteDriver } = require('better-starlite/drivers/cr-sqlite-driver');
const driver = await createCrSqliteDriver();
```

### Bun
```typescript
import { createCrSqliteDriver } from 'better-starlite/drivers/cr-sqlite-driver';
const driver = await createCrSqliteDriver();
```

### Deno
```typescript
import { createCrSqliteDriver } from '../dist/drivers/cr-sqlite-driver.ts';
const driver = await createCrSqliteDriver();
```

### Browser (with bundler)
```javascript
import { createCrSqliteDriver } from 'better-starlite/drivers/cr-sqlite-driver';
const driver = await createCrSqliteDriver();
```

## Common Patterns

### Offline Queue

```javascript
// Queue operations when offline
const queue = [];

function addTask(title) {
  if (navigator.onLine) {
    // Online - sync immediately
    db.prepare('INSERT INTO tasks (title) VALUES (?)').run(title);
    syncChanges();
  } else {
    // Offline - queue for later
    queue.push({ title });
  }
}

// Process queue when back online
window.addEventListener('online', () => {
  for (const task of queue) {
    db.prepare('INSERT INTO tasks (title) VALUES (?)').run(task.title);
  }
  queue.length = 0;
  syncChanges();
});
```

### Periodic Sync

```javascript
// Sync every 30 seconds
setInterval(async () => {
  if (navigator.onLine) {
    const changes = db.getChanges();
    if (changes.length > 0) {
      await syncToServer(changes);
    }
  }
}, 30000);
```

### Bidirectional Sync

```javascript
async function fullSync() {
  // Get local version
  const localVersion = db.getVersion();

  // Send local changes and get remote changes
  const response = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: localVersion,
      changes: db.getChanges()
    })
  });

  const { changes: remoteChanges } = await response.json();

  // Apply remote changes
  if (remoteChanges.length > 0) {
    db.applyChanges(remoteChanges);
  }
}
```

## Troubleshooting

### Driver not available
```bash
npm install @vlcn.io/crsqlite-wasm
```

### Module not found in browser
Use a bundler (Vite, Webpack, etc.)

### Changes not syncing
1. Enable CRDT: `SELECT crsql_as_crr('table_name')`
2. Check site IDs are unique
3. Verify network connectivity

## Next Steps

- [Full Documentation](./CR-SQLITE-DRIVER.md)
- [Examples](../examples/)
- [Tests](../tests/cr-sqlite-test.js)

## Resources

- [CR-SQLite GitHub](https://github.com/vlcn-io/cr-sqlite)
- [CRDT Documentation](https://crdt.tech/)
- [vlcn.io](https://vlcn.io/)

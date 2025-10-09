// Simple test to understand Deno SQLite API
import { DB } from 'https://deno.land/x/sqlite@v3.8/mod.ts';

const db = new DB(':memory:');

db.execute('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');

// Test with prepareQuery
const stmt = db.prepareQuery('INSERT INTO test (name) VALUES (?)');
stmt.execute(['John']);
stmt.execute(['Jane']);
stmt.finalize();

// Test query
const selectStmt = db.prepareQuery('SELECT * FROM test');
console.log('Column names:', selectStmt.columnNames);
console.log('Columns:', selectStmt.columns);

for (const row of selectStmt.iter()) {
  console.log('Row:', row);
}

selectStmt.finalize();
db.close();
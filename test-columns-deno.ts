// Test to understand how to get column names
import { DB } from 'https://deno.land/x/sqlite@v3.8/mod.ts';

const db = new DB(':memory:');

db.execute('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
db.execute("INSERT INTO test (name) VALUES ('John'), ('Jane')");

// Test with prepareQuery
const stmt = db.prepareQuery('SELECT * FROM test');

console.log('stmt.columnNames:', stmt.columnNames);
console.log('stmt.columns:', stmt.columns);
console.log('stmt.columns():', typeof stmt.columns === 'function' ? stmt.columns() : 'not a function');

// Get column info another way
const firstRow = stmt.first();
console.log('First row:', firstRow);

// Try getting columns from a query result
const allRows = db.query('SELECT * FROM test');
console.log('Query result:', allRows);
console.log('Query result columns:', allRows.columns);

stmt.finalize();
db.close();
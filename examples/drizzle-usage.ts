import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sql, eq } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import Database from '../src/index';
import { drizzleStarlite } from '../src/drizzle-driver';

// Define schema
const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

async function main() {
  // Create database connection
  // For local SQLite:
  const database = new Database('drizzle-test.db');

  // For rqlite (just change the connection string):
  // const database = new Database('http://localhost:4001');

  // Create Drizzle instance
  const db = drizzle(database as any);

  // Create table
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert data
  console.log('Inserting users with Drizzle...');

  await db.insert(users).values({
    name: 'Alice',
    email: 'alice@drizzle.com',
  });

  await db.insert(users).values([
    { name: 'Bob', email: 'bob@drizzle.com' },
    { name: 'Charlie', email: 'charlie@drizzle.com' },
  ]);

  // Query data
  console.log('\nQuerying all users:');
  const allUsers = await db.select().from(users);
  console.log(allUsers);

  console.log('\nFinding specific user:');
  const alice = await db
    .select()
    .from(users)
    .where(eq(users.email, 'alice@drizzle.com'));
  console.log(alice);

  // Update data
  console.log('\nUpdating user:');
  await db
    .update(users)
    .set({ name: 'Alice Updated' })
    .where(eq(users.email, 'alice@drizzle.com'));

  // Delete data
  console.log('\nDeleting user:');
  await db
    .delete(users)
    .where(eq(users.email, 'charlie@drizzle.com'));

  // Check final state
  console.log('\nFinal user list:');
  const finalUsers = await db.select().from(users);
  console.log(finalUsers);

  // Clean up
  database.close();
}

main().catch(console.error);
import { AsyncDatabase } from '../src/async';
import { drizzle } from '../src/drizzle';
import { sql, eq } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

async function main() {
  const database = new AsyncDatabase('http://localhost:4001');

  const db = drizzle(database);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('Inserting users with Drizzle (via rqlite)...');

  await db.insert(users).values({
    name: 'Alice',
    email: 'alice@drizzle.com',
  });

  await db.insert(users).values([
    { name: 'Bob', email: 'bob@drizzle.com' },
    { name: 'Charlie', email: 'charlie@drizzle.com' },
  ]);

  console.log('\nQuerying all users from rqlite:');
  const allUsers = await db.select().from(users);
  console.log(allUsers);

  console.log('\nFinding specific user:');
  const alice = await db
    .select()
    .from(users)
    .where(eq(users.email, 'alice@drizzle.com'));
  console.log(alice);

  console.log('\nUpdating user in rqlite:');
  await db
    .update(users)
    .set({ name: 'Alice Updated' })
    .where(eq(users.email, 'alice@drizzle.com'));

  console.log('\nDeleting user from rqlite:');
  await db
    .delete(users)
    .where(eq(users.email, 'charlie@drizzle.com'));

  console.log('\nFinal user list from rqlite:');
  const finalUsers = await db.select().from(users);
  console.log(finalUsers);

  await database.close();
}

main().catch(console.error);
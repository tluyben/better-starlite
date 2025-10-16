/**
 * Prisma ORM Integration with better-starlite
 *
 * This example shows how to configure Prisma to use better-starlite
 * as a drop-in replacement for better-sqlite3, enabling you to use
 * either local SQLite or distributed rqlite with the same Prisma code.
 *
 * Prerequisites:
 * 1. Install Prisma: npm install prisma @prisma/client
 * 2. Create schema.prisma file (see below)
 * 3. Run migrations: npx prisma migrate dev
 * 4. Generate client: npx prisma generate
 */

const { AsyncDatabase } = require('../dist/async-unified');

// ========================================
// PRISMA SCHEMA (save as schema.prisma)
// ========================================
const prismaSchema = `
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}

datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

model User {
  id        Int      @id @default(autoincrement())
  name      String
  email     String   @unique
  age       Int?
  createdAt DateTime @default(now())
  orders    Order[]
}

model Product {
  id          Int      @id @default(autoincrement())
  name        String
  description String?
  price       Float
  stock       Int      @default(0)
  categoryId  Int?
  createdAt   DateTime @default(now())
  orders      Order[]
}

model Order {
  id         Int      @id @default(autoincrement())
  userId     Int
  productId  Int
  quantity   Int
  totalPrice Float
  status     String   @default("pending")
  orderDate  DateTime @default(now())
  user       User     @relation(fields: [userId], references: [id])
  product    Product  @relation(fields: [productId], references: [id])
}
`;

// ========================================
// CUSTOM PRISMA ADAPTER FOR BETTER-STARLITE
// ========================================
class BetterStarlitePrismaAdapter {
  constructor(database) {
    this.database = database;
  }

  async queryRaw(params) {
    const { sql, args } = params;
    const stmt = await this.database.prepare(sql);

    // Check if it's a SELECT query
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      return await stmt.all(...(args || []));
    } else {
      const result = await stmt.run(...(args || []));
      return {
        affectedRows: result.changes,
        lastInsertId: result.lastInsertRowid,
      };
    }
  }

  async executeRaw(params) {
    const { sql, args } = params;
    const stmt = await this.database.prepare(sql);
    const result = await stmt.run(...(args || []));

    return {
      affectedRows: result.changes,
      lastInsertId: result.lastInsertRowid,
    };
  }

  async startTransaction() {
    await this.database.exec('BEGIN');
    return {
      commit: async () => await this.database.exec('COMMIT'),
      rollback: async () => await this.database.exec('ROLLBACK'),
    };
  }
}

// ========================================
// USAGE EXAMPLE
// ========================================
async function demonstratePrismaIntegration() {
  console.log('=================================================');
  console.log('Prisma ORM Integration with better-starlite');
  console.log('=================================================\n');

  // Note: This is a conceptual example. Actual Prisma integration requires:
  // 1. Prisma's driver adapter feature (currently in preview)
  // 2. Custom adapter implementation following Prisma's adapter interface

  console.log('Step 1: Save the Prisma schema');
  console.log('----------------------------------------');
  console.log('Create a file named "schema.prisma" with the following content:\n');
  console.log(prismaSchema);

  console.log('\nStep 2: Install dependencies');
  console.log('----------------------------------------');
  console.log('npm install prisma @prisma/client');

  console.log('\nStep 3: Generate Prisma Client');
  console.log('----------------------------------------');
  console.log('npx prisma generate');

  console.log('\nStep 4: Use with better-starlite');
  console.log('----------------------------------------');
  console.log(`
// For local SQLite
const localDb = new AsyncDatabase('myapp.db');
const localAdapter = new BetterStarlitePrismaAdapter(localDb);

// For rqlite
const rqliteDb = new AsyncDatabase('http://localhost:4001');
const rqliteAdapter = new BetterStarlitePrismaAdapter(rqliteDb);

// Use with Prisma Client (conceptual - requires full adapter implementation)
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  adapter: localAdapter, // or rqliteAdapter for distributed database
});
`);

  console.log('\nStep 5: Example Prisma queries');
  console.log('----------------------------------------');
  console.log(`
// Create user
const user = await prisma.user.create({
  data: {
    name: 'Alice Johnson',
    email: 'alice@example.com',
    age: 28,
  },
});

// Find users
const users = await prisma.user.findMany({
  where: {
    age: {
      gte: 30,
    },
  },
  include: {
    orders: true,
  },
});

// Update with transaction
await prisma.$transaction(async (tx) => {
  const product = await tx.product.findUnique({
    where: { id: productId },
  });

  if (product.stock > 0) {
    await tx.order.create({
      data: {
        userId: userId,
        productId: productId,
        quantity: 1,
        totalPrice: product.price,
      },
    });

    await tx.product.update({
      where: { id: productId },
      data: {
        stock: {
          decrement: 1,
        },
      },
    });
  }
});
`);
}

// ========================================
// MIGRATION HELPER
// ========================================
async function createMigrationHelper() {
  console.log('\n=================================================');
  console.log('Migration Helper: From better-sqlite3 to better-starlite');
  console.log('=================================================\n');

  console.log('Step 1: Update your database connection code');
  console.log('----------------------------------------');
  console.log('BEFORE (using better-sqlite3 directly):');
  console.log(`
const Database = require('better-sqlite3');
const db = new Database('myapp.db');
`);

  console.log('\nAFTER (using better-starlite):');
  console.log(`
const { AsyncDatabase } = require('better-starlite/dist/async-unified');
const db = new AsyncDatabase('myapp.db'); // Local SQLite
// OR
const db = new AsyncDatabase('http://localhost:4001'); // RQLite
`);

  console.log('\nStep 2: Update Prisma configuration');
  console.log('----------------------------------------');
  console.log('Enable the driverAdapters preview feature in schema.prisma:');
  console.log(`
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}
`);

  console.log('\nStep 3: Create the adapter');
  console.log('----------------------------------------');
  console.log('Use the BetterStarlitePrismaAdapter class shown above');

  console.log('\nStep 4: Initialize Prisma with the adapter');
  console.log('----------------------------------------');
  console.log(`
const prisma = new PrismaClient({
  adapter: new BetterStarlitePrismaAdapter(db),
});
`);

  console.log('\n=================================================');
  console.log('Benefits of using better-starlite with Prisma');
  console.log('=================================================\n');

  console.log('1. Seamless switching between local and distributed databases');
  console.log('2. No code changes required when moving from development to production');
  console.log('3. Built-in support for rqlite clustering');
  console.log('4. WAL mode enabled by default for better performance');
  console.log('5. Consistent API across different database backends');
  console.log('6. Cross-platform support (Node.js and Deno)');
}

// ========================================
// RUN DEMONSTRATIONS
// ========================================
async function main() {
  await demonstratePrismaIntegration();
  await createMigrationHelper();

  console.log('\n=================================================');
  console.log('Prisma Integration Guide Completed');
  console.log('=================================================\n');
  console.log('Note: Full Prisma integration requires implementing');
  console.log('the complete Prisma Driver Adapter interface.');
  console.log('This example provides the foundation and migration path.\n');
}

// Export for use in other modules
module.exports = {
  BetterStarlitePrismaAdapter,
  prismaSchema,
};

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}
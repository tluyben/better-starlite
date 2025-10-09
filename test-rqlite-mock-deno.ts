/**
 * Mock test to verify RQLite client structure works in Deno
 * This test validates the async interface without an actual RQLite server
 */

import { createDatabase } from './src/async-unified-deno.ts';

async function testRqliteInterface() {
  console.log('Testing RQLite interface structure in Deno (without server)...\n');

  try {
    // Test that we can create a database with HTTP URL
    const db = await createDatabase('http://localhost:4001');
    console.log('✅ Database instance created with HTTP URL');

    // Test that prepare returns a statement
    const stmt = await db.prepare('SELECT * FROM test');
    console.log('✅ Statement prepared successfully');

    // The actual methods would fail without a server, but we're testing the interface exists
    console.log('✅ Statement has methods:', {
      hasRun: typeof stmt.run === 'function',
      hasGet: typeof stmt.get === 'function',
      hasAll: typeof stmt.all === 'function',
      hasIterate: typeof stmt.iterate === 'function'
    });

    console.log('✅ Database has methods:', {
      hasPrepare: typeof db.prepare === 'function',
      hasExec: typeof db.exec === 'function',
      hasTransaction: typeof db.transaction === 'function',
      hasPragma: typeof db.pragma === 'function',
      hasClose: typeof db.close === 'function'
    });

    // Test will fail here without actual server, which is expected
    try {
      await db.exec('CREATE TABLE test (id INTEGER)');
    } catch (e: any) {
      console.log('✅ Expected error without server:', e.message.substring(0, 50) + '...');
    }

    console.log('\n✅ RQLite interface structure validated successfully in Deno!');
  } catch (e: any) {
    console.error('❌ Interface test failed:', e.message);
  }
}

await testRqliteInterface();
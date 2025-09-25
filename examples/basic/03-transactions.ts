/**
 * Transaction Examples
 * 
 * This example demonstrates transaction handling
 * including nested transactions and savepoints.
 */

import { DBBridge } from '@db-bridge/core';

async function basicTransaction(db: DBBridge) {
  console.log('\n=== Basic Transaction ===');

  try {
    await db.transaction(async (trx) => {
      // All queries in this block run in a transaction
      
      // Create order
      const orderId = await trx.table('orders').insert({
        user_id: 1,
        status: 'pending',
        total: 150.00,
        created_at: new Date()
      });
      console.log('Created order:', orderId);

      // Add order items
      await trx.table('order_items').insert([
        { order_id: orderId, product_id: 1, quantity: 2, price: 50.00 },
        { order_id: orderId, product_id: 2, quantity: 1, price: 50.00 }
      ]);
      console.log('Added order items');

      // Update inventory
      await trx.table('products')
        .where('id', 1)
        .decrement('stock', 2);
      
      await trx.table('products')
        .where('id', 2)
        .decrement('stock', 1);
      console.log('Updated inventory');

      // Update user's last order date
      await trx.table('users')
        .where('id', 1)
        .update({ last_order_date: new Date() });
      console.log('Updated user');

      // Transaction will be automatically committed
      console.log('✅ Transaction completed successfully');
    });

  } catch (error) {
    console.error('❌ Transaction rolled back:', error);
  }
}

async function transactionWithError(db: DBBridge) {
  console.log('\n=== Transaction with Error (Rollback) ===');

  try {
    await db.transaction(async (trx) => {
      // Insert valid data
      await trx.table('users').insert({
        name: 'Test User',
        email: 'test@example.com'
      });
      console.log('Inserted user');

      // This will cause an error and rollback everything
      await trx.table('users').insert({
        name: 'Duplicate User',
        email: 'test@example.com' // Duplicate email
      });
      console.log('This should not print');
    });

  } catch (error) {
    console.error('✅ Transaction correctly rolled back due to error');
  }
}

async function nestedTransactions(db: DBBridge) {
  console.log('\n=== Nested Transactions (Savepoints) ===');

  await db.transaction(async (trx) => {
    // Main transaction
    await trx.table('accounts').insert({
      name: 'Main Account',
      balance: 1000
    });
    console.log('Created main account');

    try {
      // Savepoint 1
      await trx.savepoint('sp1');
      
      await trx.table('transactions').insert({
        account_id: 1,
        amount: -100,
        type: 'withdrawal'
      });
      console.log('Recorded withdrawal');

      // Nested savepoint
      try {
        await trx.savepoint('sp2');
        
        // This might fail
        await trx.table('transactions').insert({
          account_id: 1,
          amount: -2000, // Exceeds balance
          type: 'withdrawal'
        });
        
      } catch (error) {
        // Rollback to savepoint 2
        await trx.rollbackToSavepoint('sp2');
        console.log('✅ Rolled back to savepoint 2');
      }

      // Continue with transaction
      await trx.table('transactions').insert({
        account_id: 1,
        amount: 50,
        type: 'deposit'
      });
      console.log('Recorded deposit');

    } catch (error) {
      // Rollback to savepoint 1
      await trx.rollbackToSavepoint('sp1');
      console.log('✅ Rolled back to savepoint 1');
    }

    console.log('✅ Main transaction completed');
  });
}

async function bankTransfer(db: DBBridge) {
  console.log('\n=== Bank Transfer Transaction ===');

  const fromAccountId = 1;
  const toAccountId = 2;
  const amount = 250.00;

  try {
    await db.transaction(async (trx) => {
      // Check sender balance
      const [sender] = await trx.table('accounts')
        .where('id', fromAccountId)
        .select('balance')
        .get();

      if (sender.balance < amount) {
        throw new Error('Insufficient funds');
      }

      // Deduct from sender
      await trx.table('accounts')
        .where('id', fromAccountId)
        .decrement('balance', amount);
      console.log(`Deducted $${amount} from account ${fromAccountId}`);

      // Add to recipient
      await trx.table('accounts')
        .where('id', toAccountId)
        .increment('balance', amount);
      console.log(`Added $${amount} to account ${toAccountId}`);

      // Record transfer
      await trx.table('transfers').insert({
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount: amount,
        status: 'completed',
        created_at: new Date()
      });
      console.log('Transfer recorded');

      // Log transaction
      await trx.table('transaction_logs').insert([
        {
          account_id: fromAccountId,
          type: 'debit',
          amount: amount,
          description: `Transfer to account ${toAccountId}`
        },
        {
          account_id: toAccountId,
          type: 'credit',
          amount: amount,
          description: `Transfer from account ${fromAccountId}`
        }
      ]);
      console.log('Transaction logs created');

      console.log('✅ Transfer completed successfully');
    });

  } catch (error) {
    console.error('❌ Transfer failed:', error);
  }
}

async function isolationLevels(db: DBBridge) {
  console.log('\n=== Transaction Isolation Levels ===');

  // Different isolation levels for different use cases
  const isolationExamples = [
    {
      level: 'READ UNCOMMITTED',
      description: 'Lowest isolation, allows dirty reads'
    },
    {
      level: 'READ COMMITTED',
      description: 'Default for most databases, prevents dirty reads'
    },
    {
      level: 'REPEATABLE READ',
      description: 'Prevents dirty and non-repeatable reads'
    },
    {
      level: 'SERIALIZABLE',
      description: 'Highest isolation, prevents all phenomena'
    }
  ];

  for (const example of isolationExamples) {
    console.log(`\n--- ${example.level} ---`);
    console.log(example.description);

    try {
      const trx = await db.beginTransaction({
        isolationLevel: example.level as any
      });

      // Perform operations
      const users = await trx.query('SELECT COUNT(*) as count FROM users');
      console.log('User count:', users.rows[0].count);

      await trx.commit();
      console.log('✅ Transaction committed');

    } catch (error) {
      console.error('Error:', error);
    }
  }
}

async function batchOperationsInTransaction(db: DBBridge) {
  console.log('\n=== Batch Operations in Transaction ===');

  const users = [
    { name: 'Alice', email: 'alice@example.com', role: 'user' },
    { name: 'Bob', email: 'bob@example.com', role: 'user' },
    { name: 'Charlie', email: 'charlie@example.com', role: 'admin' }
  ];

  try {
    await db.transaction(async (trx) => {
      // Batch insert users
      const userIds = await trx.table('users').insert(users);
      console.log('Inserted users:', userIds);

      // Create initial profiles for all users
      const profiles = userIds.map(id => ({
        user_id: id,
        bio: 'Welcome to our platform!',
        avatar: 'default.png'
      }));
      
      await trx.table('profiles').insert(profiles);
      console.log('Created user profiles');

      // Send welcome notifications
      const notifications = userIds.map(id => ({
        user_id: id,
        type: 'welcome',
        title: 'Welcome!',
        message: 'Thanks for joining our platform',
        read: false
      }));

      await trx.table('notifications').insert(notifications);
      console.log('Created welcome notifications');

      console.log('✅ Batch operation completed');
    });

  } catch (error) {
    console.error('❌ Batch operation failed:', error);
  }
}

// Main function
async function main() {
  console.log('=== Transaction Examples ===');
  
  const db = DBBridge.mysql({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'test_db'
  });

  try {
    await db.connect();
    console.log('✅ Connected to database');

    // Run examples
    await basicTransaction(db);
    await transactionWithError(db);
    await nestedTransactions(db);
    await bankTransfer(db);
    await isolationLevels(db);
    await batchOperationsInTransaction(db);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.disconnect();
    console.log('\n✅ Disconnected from database');
  }
}

main().catch(console.error);
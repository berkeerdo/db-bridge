/**
 * migrate:rollback Command
 * Rollback the last batch of migrations
 */

import { createRunnerFromConfig, success, info, error } from '../utils';

export interface RollbackOptions {
  dryRun?: boolean;
  step?: number;
}

export async function rollbackCommand(options: RollbackOptions = {}): Promise<void> {
  let adapter;

  try {
    if (options.dryRun) {
      info('DRY RUN MODE - No changes will be made');
    }

    const { runner, adapter: a } = await createRunnerFromConfig(options);
    adapter = a;

    const step = options.step ?? 1;
    const rolledBack = await runner.rollback(step);

    if (rolledBack.length === 0) {
      info('Nothing to rollback');
    } else {
      console.log('');
      success(`Rolled back ${rolledBack.length} migration(s):`);
      for (const name of rolledBack) {
        console.log(`  - ${name}`);
      }
    }
  } catch (error_) {
    error((error_ as Error).message);
    process.exit(1);
  } finally {
    if (adapter) {
      await adapter.disconnect();
    }
  }
}

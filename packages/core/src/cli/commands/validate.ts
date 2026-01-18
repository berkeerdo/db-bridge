/**
 * migrate:validate Command
 * Validate migration checksums and integrity
 */

import { createRunnerFromConfig, success, error, info, warn } from '../utils';

export async function validateCommand(): Promise<void> {
  let adapter;

  try {
    info('Validating migrations...');
    console.log('');

    const { runner, adapter: a } = await createRunnerFromConfig();
    adapter = a;

    const result = await runner.validate();

    if (result.valid) {
      success('All migrations are valid');
    } else {
      warn('Migration validation failed:');
      console.log('');
      for (const err of result.errors) {
        error(`  ${err}`);
      }
      console.log('');
      process.exit(1);
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

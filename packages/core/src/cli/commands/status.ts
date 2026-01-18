/**
 * migrate:status Command
 * Show migration status
 */

import { createRunnerFromConfig, formatTable, error } from '../utils';

export async function statusCommand(): Promise<void> {
  let adapter;

  try {
    const { runner, adapter: a } = await createRunnerFromConfig();
    adapter = a;

    const status = await runner.status();

    if (status.length === 0) {
      console.log('No migrations found');
      return;
    }

    // Prepare table data
    const headers = ['Migration', 'Batch', 'Status', 'Executed At'];
    const rows = status.map((s) => [
      s.name,
      s.batch?.toString() || '-',
      s.pending ? 'Pending' : 'Executed',
      s.executedAt ? new Date(s.executedAt).toLocaleString() : '-',
    ]);

    console.log('');
    console.log('Migration Status:');
    console.log('');
    console.log(formatTable(headers, rows));
    console.log('');

    const pendingCount = status.filter((s) => s.pending).length;
    const executedCount = status.filter((s) => !s.pending).length;

    console.log(
      `Total: ${status.length} migrations (${executedCount} executed, ${pendingCount} pending)`,
    );
  } catch (error_) {
    error((error_ as Error).message);
    process.exit(1);
  } finally {
    if (adapter) {
      await adapter.disconnect();
    }
  }
}

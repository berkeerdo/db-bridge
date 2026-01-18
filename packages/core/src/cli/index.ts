#!/usr/bin/env node
/**
 * db-bridge CLI
 * Command-line interface for database migrations and seeding
 */

import { parseArgs } from 'node:util';

import { freshCommand } from './commands/fresh';
import { latestCommand } from './commands/latest';
import { makeCommand } from './commands/make';
import { makeSeederCommand } from './commands/make-seeder';
import { resetCommand } from './commands/reset';
import { rollbackCommand } from './commands/rollback';
import { seedCommand } from './commands/seed';
import { statusCommand } from './commands/status';
import { validateCommand } from './commands/validate';

const VERSION = '1.0.0';

const HELP = `
db-bridge - Database Migration & Seeding CLI

Usage:
  db-bridge <command> [options]

Migration Commands:
  migrate:make <name>     Create a new migration file
  migrate:latest          Run all pending migrations
  migrate:rollback        Rollback the last batch of migrations
  migrate:status          Show migration status
  migrate:reset           Rollback all migrations
  migrate:fresh           Drop all tables and re-run migrations
  migrate:validate        Validate migration checksums

Seed Commands:
  make:seeder <name>      Create a new seeder file
  db:seed                 Run database seeders
  db:seed --class=<name>  Run a specific seeder

Options:
  --help, -h              Show this help message
  --version, -v           Show version number
  --dry-run               Show what would be done without executing
  --step=<n>              Number of batches to rollback (for rollback command)
  --class=<name>          Specific seeder class to run (for db:seed)

Examples:
  db-bridge migrate:make create_users_table
  db-bridge migrate:latest
  db-bridge migrate:rollback --step=2
  db-bridge make:seeder users
  db-bridge db:seed
  db-bridge db:seed --class=users
`;

interface CLIOptions {
  help?: boolean;
  version?: boolean;
  dryRun?: boolean;
  step?: number;
  class?: string;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse options
  let options: CLIOptions = {};
  let command = '';
  let commandArgs: string[] = [];

  try {
    const { values, positionals } = parseArgs({
      args,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
        'dry-run': { type: 'boolean' },
        step: { type: 'string' },
        class: { type: 'string' },
      },
      allowPositionals: true,
    });

    options = {
      help: values.help,
      version: values.version,
      dryRun: values['dry-run'],
      step: values.step ? parseInt(values.step, 10) : undefined,
      class: values.class,
    };

    command = positionals[0] || '';
    commandArgs = positionals.slice(1);
  } catch {
    // If parsing fails, try simple parsing
    command = args[0] || '';
    commandArgs = args.slice(1).filter((a) => !a.startsWith('-'));
    options.help = args.includes('--help') || args.includes('-h');
    options.version = args.includes('--version') || args.includes('-v');
    options.dryRun = args.includes('--dry-run');

    const stepArg = args.find((a) => a.startsWith('--step='));
    if (stepArg) {
      options.step = parseInt(stepArg.split('=')[1] || '1', 10);
    }

    const classArg = args.find((a) => a.startsWith('--class='));
    if (classArg) {
      options.class = classArg.split('=')[1];
    }
  }

  // Handle help and version
  if (options.help || command === 'help') {
    console.log(HELP);
    process.exit(0);
  }

  if (options.version) {
    console.log(`db-bridge v${VERSION}`);
    process.exit(0);
  }

  // No command provided
  if (!command) {
    console.log(HELP);
    process.exit(0);
  }

  // Execute command
  try {
    switch (command) {
      case 'migrate:make': {
        if (!commandArgs[0]) {
          console.error('Error: Migration name is required');
          console.log('Usage: db-bridge migrate:make <name>');
          process.exit(1);
        }
        await makeCommand(commandArgs[0]);
        break;
      }

      case 'migrate:latest': {
        await latestCommand({ dryRun: options.dryRun });
        break;
      }

      case 'migrate:rollback': {
        await rollbackCommand({ dryRun: options.dryRun, step: options.step });
        break;
      }

      case 'migrate:status': {
        await statusCommand();
        break;
      }

      case 'migrate:reset': {
        await resetCommand({ dryRun: options.dryRun });
        break;
      }

      case 'migrate:fresh': {
        await freshCommand({ dryRun: options.dryRun });
        break;
      }

      case 'migrate:validate': {
        await validateCommand();
        break;
      }

      case 'make:seeder': {
        if (!commandArgs[0]) {
          console.error('Error: Seeder name is required');
          console.log('Usage: db-bridge make:seeder <name>');
          process.exit(1);
        }
        await makeSeederCommand(commandArgs[0]);
        break;
      }

      case 'db:seed': {
        await seedCommand({ class: options.class });
        break;
      }

      default: {
        console.error(`Unknown command: ${command}`);
        console.log('Run "db-bridge --help" for usage information.');
        process.exit(1);
      }
    }
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

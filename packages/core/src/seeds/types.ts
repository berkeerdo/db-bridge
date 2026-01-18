/**
 * Seed System Types
 */

import type { DatabaseAdapter } from '../interfaces';

/**
 * Seeder interface
 */
export interface Seeder {
  /** Seeder name (auto-generated from filename) */
  name?: string;

  /** Run the seeder */
  run(adapter: DatabaseAdapter): Promise<void>;
}

/**
 * Seeder file info
 */
export interface SeederFile {
  name: string;
  path: string;
}

/**
 * Seeder runner options
 */
export interface SeederRunnerOptions {
  /** Directory containing seeder files */
  directory: string;

  /** Specific seeders to run (by name) */
  only?: string[];

  /** Seeders to exclude */
  except?: string[];
}

/**
 * Factory function for creating seeders with helper utilities
 */
export interface SeederFactory {
  (adapter: DatabaseAdapter): Promise<void>;
}

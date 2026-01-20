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

  /**
   * Priority for execution order (lower runs first)
   * Default: 100
   * @example priority: 1  // Runs early (users, roles)
   * @example priority: 50 // Runs middle (products, categories)
   * @example priority: 100 // Runs late (orders, logs) - default
   */
  priority?: number;

  /**
   * Dependencies - names of seeders that must run before this one
   * @example depends: ['users', 'products'] // Runs after users_seeder and products_seeder
   */
  depends?: string[];

  /** Run the seeder */
  run(adapter: DatabaseAdapter): Promise<void>;
}

/**
 * Seeder file info
 */
export interface SeederFile {
  name: string;
  path: string;
  priority?: number;
  depends?: string[];
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

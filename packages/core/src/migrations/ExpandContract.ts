/**
 * Expand/Contract Pattern Helpers
 *
 * Zero-downtime migration pattern that works in three phases:
 * 1. EXPAND - Add new columns/tables without breaking existing code
 * 2. MIGRATE - Move/transform data from old to new structures
 * 3. CONTRACT - Remove old columns/tables after code is updated
 *
 * Usage:
 * - Create separate migrations for each phase
 * - Deploy expand migrations first
 * - Update application code to use new structure
 * - Deploy migrate phase to copy/transform data
 * - Deploy contract phase to clean up old structure
 */

import type { DatabaseAdapter } from '../interfaces';
import type { SchemaBuilder } from '../schema';

export type Phase = 'expand' | 'migrate' | 'contract';

/**
 * Expand/Contract migration interface
 */
export interface ExpandContractMigration {
  name: string;
  phase: Phase;
  description?: string;

  /** Run the expansion phase (add new structure) */
  expand?: (schema: SchemaBuilder) => Promise<void>;

  /** Run the migration phase (copy/transform data) */
  migrate?: (adapter: DatabaseAdapter, schema: SchemaBuilder) => Promise<void>;

  /** Run the contraction phase (remove old structure) */
  contract?: (schema: SchemaBuilder) => Promise<void>;

  /** Reverse expansion */
  rollbackExpand?: (schema: SchemaBuilder) => Promise<void>;

  /** Reverse data migration */
  rollbackMigrate?: (adapter: DatabaseAdapter, schema: SchemaBuilder) => Promise<void>;

  /** Reverse contraction */
  rollbackContract?: (schema: SchemaBuilder) => Promise<void>;
}

/**
 * Helper class for common expand/contract operations
 */
export class ExpandContractHelper {
  constructor(
    private readonly adapter: DatabaseAdapter,
    private readonly schema: SchemaBuilder,
  ) {}

  /**
   * Rename a column using expand/contract pattern
   * Expand: Add new column
   * Migrate: Copy data from old to new
   * Contract: Drop old column
   */
  async renameColumn(
    table: string,
    oldColumn: string,
    newColumn: string,
    phase: Phase,
  ): Promise<void> {
    switch (phase) {
      case 'expand': {
        // Get column definition from old column and add new one
        await this.schema.alterTable(table, (t) => {
          t.addColumn(newColumn, 'text'); // Will be overridden by actual type
        });
        break;
      }

      case 'migrate': {
        // Copy data from old column to new
        await this.adapter.execute(
          `UPDATE ${table} SET ${newColumn} = ${oldColumn} WHERE ${newColumn} IS NULL`,
        );
        break;
      }

      case 'contract': {
        await this.schema.alterTable(table, (t) => {
          t.dropColumn(oldColumn);
        });
        break;
      }
    }
  }

  /**
   * Change column type using expand/contract pattern
   */
  async changeColumnType(
    table: string,
    column: string,
    newType: string,
    transform: string, // SQL expression to transform data
    phase: Phase,
  ): Promise<void> {
    const tempColumn = `${column}_new`;

    switch (phase) {
      case 'expand': {
        await this.adapter.execute(`ALTER TABLE ${table} ADD COLUMN ${tempColumn} ${newType}`);
        break;
      }

      case 'migrate': {
        await this.adapter.execute(`UPDATE ${table} SET ${tempColumn} = ${transform}`);
        break;
      }

      case 'contract': {
        await this.adapter.execute(`ALTER TABLE ${table} DROP COLUMN ${column}`);
        await this.adapter.execute(`ALTER TABLE ${table} RENAME COLUMN ${tempColumn} TO ${column}`);
        break;
      }
    }
  }

  /**
   * Split a table into two tables using expand/contract
   */
  async splitTable(
    sourceTable: string,
    newTable: string,
    columnsToMove: string[],
    foreignKeyColumn: string,
    phase: Phase,
  ): Promise<void> {
    switch (phase) {
      case 'expand': {
        // Create new table with moved columns
        await this.schema.createTable(newTable, (t) => {
          t.increments('id');
          t.integer(foreignKeyColumn).notNull();
          // Columns will need to be added manually based on types
        });
        break;
      }

      case 'migrate': {
        // Copy data to new table
        const cols = columnsToMove.join(', ');
        await this.adapter.execute(
          `INSERT INTO ${newTable} (${foreignKeyColumn}, ${cols})
           SELECT id, ${cols} FROM ${sourceTable}`,
        );
        break;
      }

      case 'contract': {
        // Drop columns from original table
        for (const col of columnsToMove) {
          await this.schema.alterTable(sourceTable, (t) => {
            t.dropColumn(col);
          });
        }
        break;
      }
    }
  }

  /**
   * Merge two tables into one using expand/contract
   */
  async mergeTables(
    targetTable: string,
    sourceTable: string,
    columnsToMerge: string[],
    joinColumn: string,
    phase: Phase,
  ): Promise<void> {
    switch (phase) {
      case 'expand': {
        // Add columns to target table
        for (const col of columnsToMerge) {
          await this.schema.alterTable(targetTable, (t) => {
            t.addColumn(col, 'text'); // Type will be inferred
          });
        }
        break;
      }

      case 'migrate': {
        // Copy data from source to target
        const setClauses = columnsToMerge
          .map((col) => `${targetTable}.${col} = ${sourceTable}.${col}`)
          .join(', ');

        await this.adapter.execute(
          `UPDATE ${targetTable}
           SET ${setClauses}
           FROM ${sourceTable}
           WHERE ${targetTable}.id = ${sourceTable}.${joinColumn}`,
        );
        break;
      }

      case 'contract': {
        // Drop source table
        await this.schema.dropTable(sourceTable);
        break;
      }
    }
  }

  /**
   * Add NOT NULL constraint safely
   */
  async addNotNullConstraint(
    table: string,
    column: string,
    defaultValue: string,
    phase: Phase,
  ): Promise<void> {
    switch (phase) {
      case 'expand': {
        // Add default value for existing nulls
        await this.adapter.execute(
          `UPDATE ${table} SET ${column} = ${defaultValue} WHERE ${column} IS NULL`,
        );
        break;
      }

      case 'migrate': {
        // Ensure no nulls remain
        const result = await this.adapter.query<{ count: number }>(
          `SELECT COUNT(*) as count FROM ${table} WHERE ${column} IS NULL`,
        );
        if (result.rows[0]?.count && result.rows[0].count > 0) {
          throw new Error(
            `Cannot add NOT NULL: ${result.rows[0].count} rows still have NULL values`,
          );
        }
        break;
      }

      case 'contract': {
        // Add the NOT NULL constraint
        await this.schema.alterTable(table, (t) => {
          t.modifyColumn(column, 'text', { nullable: false });
        });
        break;
      }
    }
  }
}

/**
 * Create expand/contract helper for use in migrations
 */
export function createExpandContractHelper(
  adapter: DatabaseAdapter,
  schema: SchemaBuilder,
): ExpandContractHelper {
  return new ExpandContractHelper(adapter, schema);
}

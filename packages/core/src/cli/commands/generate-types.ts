/**
 * generate:types Command
 * Generate TypeScript interfaces from database schema
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { TypeGenerator } from '../../types/TypeGenerator';
import { loadConfig } from '../config';
import { createAdapterFromConfig, success, error, info } from '../utils';

export interface GenerateTypesOptions {
  /** Output file path */
  output?: string;
  /** Tables to include (comma-separated) */
  tables?: string;
  /** Tables to exclude (comma-separated) */
  exclude?: string;
  /** Use camelCase for property names */
  camelCase?: boolean;
  /** Include JSDoc comments */
  comments?: boolean;
}

export async function generateTypesCommand(options: GenerateTypesOptions = {}): Promise<void> {
  let adapter;

  try {
    const config = await loadConfig();
    adapter = await createAdapterFromConfig(config);

    info('Generating TypeScript types from database schema...');
    console.log('');

    const generator = new TypeGenerator(adapter, config.connection.dialect);

    const types = await generator.generate({
      tables: options.tables ? options.tables.split(',').map((t) => t.trim()) : undefined,
      exclude: options.exclude ? options.exclude.split(',').map((t) => t.trim()) : undefined,
      camelCase: options.camelCase ?? false,
      includeComments: options.comments ?? true,
      optionalNullable: true,
    });

    // Determine output path
    const outputPath = resolve(
      process.cwd(),
      options.output || config.types?.output || './src/types/database.ts',
    );

    // Ensure directory exists
    await mkdir(dirname(outputPath), { recursive: true });

    // Write file
    await writeFile(outputPath, types, 'utf8');

    console.log('');
    success(`Types generated: ${outputPath}`);

    // Count interfaces
    const interfaceCount = (types.match(/export interface/g) || []).length;
    info(`Generated ${interfaceCount} interface(s)`);
  } catch (error_) {
    error((error_ as Error).message);
    process.exit(1);
  } finally {
    if (adapter) {
      await adapter.disconnect();
    }
  }
}

import { CacheError } from '@db-bridge/core';
import { EventEmitter } from 'eventemitter3';

import type Redis from 'ioredis';

export interface StreamEntry {
  id: string;
  fields: Record<string, string>;
}

export interface StreamInfo {
  length: number;
  radixTreeKeys: number;
  radixTreeNodes: number;
  groups: number;
  lastGeneratedId: string;
  firstEntry?: StreamEntry;
  lastEntry?: StreamEntry;
}

export class StreamBaseTrait extends EventEmitter {
  constructor(protected client: Redis) {
    super();
  }

  protected parseEntries(raw: any[]): StreamEntry[] {
    return raw.map(([id, fields]) => ({
      id,
      fields: this.parseFields(fields),
    }));
  }

  protected parseFields(raw: string[]): Record<string, string> {
    const fields: Record<string, string> = {};

    for (let i = 0; i < raw.length; i += 2) {
      fields[raw[i]!] = raw[i + 1]!;
    }

    return fields;
  }

  protected parseStreamResults(raw: any[]): Array<[string, StreamEntry[]]> {
    return raw.map(([stream, entries]) => [stream, this.parseEntries(entries)]);
  }

  protected camelCase(str: string): string {
    return str.replaceAll(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  protected throwError(message: string, key?: string, error?: Error): never {
    throw new CacheError(message, key, error);
  }
}

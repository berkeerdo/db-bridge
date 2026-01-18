import { StreamInfoTrait } from './traits/stream-info-trait';

import type Redis from 'ioredis';

export * from './traits/stream-base-trait';
export * from './traits/stream-consumer-trait';

/**
 * Modular Redis Stream Manager
 * Refactored from 453 lines to modular traits
 */
export class ModularRedisStreamManager extends StreamInfoTrait {
  constructor(client: Redis) {
    super(client);
  }

  // Additional high-level methods can be added here
  async createStreamWithGroup(
    key: string,
    groupName: string,
    options?: {
      maxlen?: number;
      approximate?: boolean;
    },
  ): Promise<void> {
    // Create stream with initial entry if needed
    await this.xadd(key, '*', { init: 'true' }, options);

    // Create consumer group
    await this.xgroupCreate(key, groupName, '0');

    // Delete the init entry
    const entries = await this.xrange(key, '-', '+', 1);
    if (entries.length > 0 && entries[0]?.fields['init'] === 'true') {
      await this.xdel(key, entries[0].id);
    }
  }

  async getStreamStats(key: string): Promise<{
    length: number;
    info: any;
    groups?: any[];
  }> {
    const length = await this.xlen(key);
    const info = await this.xinfo('STREAM', key);

    let groups: any[] | undefined;
    try {
      const groupsInfo = await this.xinfo('GROUPS', key);
      groups = Array.isArray(groupsInfo) ? groupsInfo : undefined;
    } catch {
      // Stream might not have consumer groups
    }

    return { length, info, groups };
  }

  async consumeStream(
    groupName: string,
    consumerName: string,
    keys: string[],
    options?: {
      count?: number;
      block?: number;
      processMessage: (key: string, message: any) => Promise<void>;
      autoAck?: boolean;
    },
  ): Promise<number> {
    const streams: Record<string, string> = {};
    keys.forEach((key) => {
      streams[key] = '>';
    });

    const messages = await this.xreadgroup(groupName, consumerName, streams, {
      count: options?.count,
      block: options?.block,
      noack: options?.autoAck,
    });

    let processedCount = 0;

    for (const [streamKey, entries] of messages) {
      for (const entry of entries) {
        if (options?.processMessage) {
          await options.processMessage(streamKey, entry);
        }

        if (!options?.autoAck) {
          await this.xack(streamKey, groupName, entry.id);
        }

        processedCount++;
      }
    }

    return processedCount;
  }
}

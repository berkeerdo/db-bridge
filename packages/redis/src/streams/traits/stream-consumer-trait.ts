import { StreamReadTrait } from './stream-read-trait';
import { StreamEntry } from './stream-base-trait';

export interface ConsumerGroupInfo {
  name: string;
  consumers: number;
  pending: number;
  lastDeliveredId: string;
}

export class StreamConsumerTrait extends StreamReadTrait {
  async xgroupCreate(
    key: string,
    groupName: string,
    id: string = '$',
    mkstream = false
  ): Promise<void> {
    try {
      const args: (string | boolean)[] = [key, groupName, id];
      
      if (mkstream) {
        args.push('MKSTREAM');
      }

      if (mkstream) {
        await this.client.xgroup('CREATE', key, groupName, id, 'MKSTREAM');
      } else {
        await this.client.xgroup('CREATE', key, groupName, id);
      }
    } catch (error) {
      // Ignore error if group already exists
      if (!(error as any).message?.includes('BUSYGROUP')) {
        this.throwError(`Failed to create consumer group ${groupName}`, key, error as Error);
      }
    }
  }

  async xgroupDestroy(key: string, groupName: string): Promise<boolean> {
    try {
      const result = await this.client.xgroup('DESTROY', key, groupName);
      return result === 1;
    } catch (error) {
      this.throwError(`Failed to destroy consumer group ${groupName}`, key, error as Error);
    }
  }

  async xgroupSetId(key: string, groupName: string, id: string): Promise<void> {
    try {
      await this.client.xgroup('SETID', key, groupName, id);
    } catch (error) {
      this.throwError(`Failed to set ID for consumer group ${groupName}`, key, error as Error);
    }
  }

  async xreadgroup(
    groupName: string,
    consumerName: string,
    streams: Record<string, string>,
    options?: {
      count?: number;
      block?: number;
      noack?: boolean;
    }
  ): Promise<Array<[string, StreamEntry[]]>> {
    try {
      const args: (string | number)[] = ['GROUP', groupName, consumerName];

      if (options?.count) {
        args.push('COUNT', options.count);
      }
      if (options?.block !== undefined) {
        args.push('BLOCK', options.block);
      }
      if (options?.noack) {
        args.push('NOACK');
      }

      args.push('STREAMS');
      
      const keys = Object.keys(streams);
      const ids = Object.values(streams);
      args.push(...keys, ...ids);

      const result = await (this.client as any).xreadgroup(...args);
      
      if (!result) return [];

      return this.parseStreamResults(result as any);
    } catch (error) {
      this.throwError('Failed to read from consumer group', undefined, error as Error);
    }
  }

  async xack(key: string, groupName: string, ...ids: string[]): Promise<number> {
    try {
      return await this.client.xack(key, groupName, ...ids);
    } catch (error) {
      this.throwError(`Failed to acknowledge messages in group ${groupName}`, key, error as Error);
    }
  }

  async xpending(
    key: string,
    groupName: string,
    options?: {
      start?: string;
      end?: string;
      count?: number;
      consumer?: string;
    }
  ): Promise<any> {
    try {
      const args: (string | number)[] = [key, groupName];

      if (options?.start && options?.end) {
        args.push(options.start, options.end, options.count || 10);
        
        if (options.consumer) {
          args.push(options.consumer);
        }
      }

      return await (this.client as any).xpending(...args);
    } catch (error) {
      this.throwError(`Failed to get pending messages for group ${groupName}`, key, error as Error);
    }
  }

  async xclaim(
    key: string,
    groupName: string,
    consumerName: string,
    minIdleTime: number,
    ids: string[],
    options?: {
      idle?: number;
      time?: number;
      retrycount?: number;
      force?: boolean;
      justid?: boolean;
    }
  ): Promise<StreamEntry[] | string[]> {
    try {
      const args: (string | number)[] = [key, groupName, consumerName, minIdleTime, ...ids];

      if (options?.idle) {
        args.push('IDLE', options.idle);
      }
      if (options?.time) {
        args.push('TIME', options.time);
      }
      if (options?.retrycount) {
        args.push('RETRYCOUNT', options.retrycount);
      }
      if (options?.force) {
        args.push('FORCE');
      }
      if (options?.justid) {
        args.push('JUSTID');
      }

      const result = await (this.client as any).xclaim(...args);
      
      if (options?.justid) {
        return result as string[];
      }
      
      return this.parseEntries(result as any);
    } catch (error) {
      this.throwError(`Failed to claim messages for consumer ${consumerName}`, key, error as Error);
    }
  }
}
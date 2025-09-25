import Redis from 'ioredis';
import { EventEmitter } from 'eventemitter3';
import { CacheError } from '@db-bridge/core';

export interface StreamEntry {
  id: string;
  fields: Record<string, string>;
}

export interface ConsumerGroupInfo {
  name: string;
  consumers: number;
  pending: number;
  lastDeliveredId: string;
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

export class RedisStreamManager extends EventEmitter {
  constructor(private client: Redis) {
    super();
  }

  async xadd(
    key: string,
    _id: string | '*' = '*',
    fields: Record<string, string | number | boolean>,
    options?: {
      maxlen?: number;
      approximate?: boolean;
    }
  ): Promise<string> {
    try {
      const args: (string | number)[] = [key];

      if (options?.maxlen) {
        args.push('MAXLEN');
        if (options.approximate) {
          args.push('~');
        }
        args.push(options.maxlen);
      }

      args.push(_id);

      // Flatten fields
      Object.entries(fields).forEach(([field, value]) => {
        args.push(field, String(value));
      });

      const resultId = await this.client.xadd(key, args[1] as string, ...args.slice(2) as string[]);
      return resultId || '';
    } catch (error) {
      throw new CacheError(`Failed to add to stream ${key}`, key, error as Error);
    }
  }

  async xread(
    streams: Record<string, string>,
    options?: {
      count?: number;
      block?: number;
    }
  ): Promise<Array<[string, StreamEntry[]]>> {
    try {
      const args: (string | number)[] = [];

      if (options?.count) {
        args.push('COUNT', options.count);
      }
      if (options?.block !== undefined) {
        args.push('BLOCK', options.block);
      }

      args.push('STREAMS');
      
      const keys = Object.keys(streams);
      const ids = Object.values(streams);
      args.push(...keys, ...ids);

      const result = await (this.client as any).xread(...args);
      
      if (!result) return [];

      return this.parseStreamResults(result as any);
    } catch (error) {
      throw new CacheError('Failed to read from streams', undefined, error as Error);
    }
  }

  async xrange(
    key: string,
    start: string = '-',
    end: string = '+',
    count?: number
  ): Promise<StreamEntry[]> {
    try {
      const args: (string | number)[] = [key, start, end];
      
      if (count) {
        args.push('COUNT', count);
      }

      const result = count 
        ? await this.client.xrange(key, start, end, 'COUNT', count)
        : await this.client.xrange(key, start, end);
      return this.parseEntries(result as any);
    } catch (error) {
      throw new CacheError(`Failed to read range from stream ${key}`, key, error as Error);
    }
  }

  async xrevrange(
    key: string,
    end: string = '+',
    start: string = '-',
    count?: number
  ): Promise<StreamEntry[]> {
    try {
      const args: (string | number)[] = [key, end, start];
      
      if (count) {
        args.push('COUNT', count);
      }

      const result = count
        ? await this.client.xrevrange(key, end, start, 'COUNT', count)
        : await this.client.xrevrange(key, end, start);
      return this.parseEntries(result as any);
    } catch (error) {
      throw new CacheError(`Failed to read reverse range from stream ${key}`, key, error as Error);
    }
  }

  async xlen(key: string): Promise<number> {
    try {
      return await this.client.xlen(key);
    } catch (error) {
      throw new CacheError(`Failed to get stream length ${key}`, key, error as Error);
    }
  }

  async xdel(key: string, ...ids: string[]): Promise<number> {
    try {
      return await this.client.xdel(key, ...ids);
    } catch (error) {
      throw new CacheError(`Failed to delete from stream ${key}`, key, error as Error);
    }
  }

  async xtrim(
    key: string,
    maxlen: number,
    approximate = false
  ): Promise<number> {
    try {
      const args: (string | number)[] = [key, 'MAXLEN'];
      
      if (approximate) {
        args.push('~');
      }
      
      args.push(maxlen);

      return approximate
        ? await this.client.xtrim(key, 'MAXLEN', '~', maxlen)
        : await this.client.xtrim(key, 'MAXLEN', maxlen);
    } catch (error) {
      throw new CacheError(`Failed to trim stream ${key}`, key, error as Error);
    }
  }

  // Consumer group operations
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
        throw new CacheError(`Failed to create consumer group ${groupName}`, key, error as Error);
      }
    }
  }

  async xgroupDestroy(key: string, groupName: string): Promise<boolean> {
    try {
      const result = await this.client.xgroup('DESTROY', key, groupName);
      return result === 1;
    } catch (error) {
      throw new CacheError(`Failed to destroy consumer group ${groupName}`, key, error as Error);
    }
  }

  async xgroupSetId(key: string, groupName: string, id: string): Promise<void> {
    try {
      await this.client.xgroup('SETID', key, groupName, id);
    } catch (error) {
      throw new CacheError(`Failed to set ID for consumer group ${groupName}`, key, error as Error);
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
      throw new CacheError('Failed to read from consumer group', undefined, error as Error);
    }
  }

  async xack(key: string, groupName: string, ...ids: string[]): Promise<number> {
    try {
      return await this.client.xack(key, groupName, ...ids);
    } catch (error) {
      throw new CacheError(`Failed to acknowledge messages in group ${groupName}`, key, error as Error);
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
      throw new CacheError(`Failed to get pending messages for group ${groupName}`, key, error as Error);
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
      throw new CacheError(`Failed to claim messages for consumer ${consumerName}`, key, error as Error);
    }
  }

  async xinfo(
    subcommand: 'STREAM' | 'GROUPS' | 'CONSUMERS',
    key: string,
    groupName?: string
  ): Promise<StreamInfo | ConsumerGroupInfo[] | any[]> {
    try {
      const args: string[] = [subcommand, key];
      
      if (groupName && subcommand === 'CONSUMERS') {
        args.push(groupName);
      }

      const result = await (this.client as any).xinfo(...args);
      
      if (subcommand === 'STREAM') {
        return this.parseStreamInfo(result as any);
      } else if (subcommand === 'GROUPS') {
        return this.parseGroupsInfo(result as any);
      } else {
        return result as any[];
      }
    } catch (error) {
      throw new CacheError(`Failed to get info for stream ${key}`, key, error as Error);
    }
  }

  private parseEntries(raw: any[]): StreamEntry[] {
    return raw.map(([id, fields]) => ({
      id,
      fields: this.parseFields(fields),
    }));
  }

  private parseFields(raw: string[]): Record<string, string> {
    const fields: Record<string, string> = {};
    
    for (let i = 0; i < raw.length; i += 2) {
      fields[raw[i]!] = raw[i + 1]!;
    }
    
    return fields;
  }

  private parseStreamResults(raw: any[]): Array<[string, StreamEntry[]]> {
    return raw.map(([stream, entries]) => [
      stream,
      this.parseEntries(entries),
    ]);
  }

  private parseStreamInfo(raw: any[]): StreamInfo {
    const info: any = {};
    
    for (let i = 0; i < raw.length; i += 2) {
      const key = raw[i];
      const value = raw[i + 1];
      
      switch (key) {
        case 'length':
        case 'radix-tree-keys':
        case 'radix-tree-nodes':
        case 'groups':
          info[this.camelCase(key)] = value;
          break;
        case 'last-generated-id':
          info.lastGeneratedId = value;
          break;
        case 'first-entry':
        case 'last-entry':
          if (value) {
            info[this.camelCase(key)] = {
              id: value[0],
              fields: this.parseFields(value[1]),
            };
          }
          break;
      }
    }
    
    return info as StreamInfo;
  }

  private parseGroupsInfo(raw: any[]): ConsumerGroupInfo[] {
    return raw.map((group) => {
      const info: any = {};
      
      for (let i = 0; i < group.length; i += 2) {
        const key = group[i];
        const value = group[i + 1];
        
        switch (key) {
          case 'name':
          case 'consumers':
          case 'pending':
            info[key] = value;
            break;
          case 'last-delivered-id':
            info.lastDeliveredId = value;
            break;
        }
      }
      
      return info as ConsumerGroupInfo;
    });
  }

  private camelCase(str: string): string {
    return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }
}
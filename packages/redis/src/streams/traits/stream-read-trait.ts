import { StreamCrudTrait } from './stream-crud-trait';
import { StreamEntry } from './stream-base-trait';

export class StreamReadTrait extends StreamCrudTrait {
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
      this.throwError('Failed to read from streams', undefined, error as Error);
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
      this.throwError(`Failed to read range from stream ${key}`, key, error as Error);
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
      this.throwError(`Failed to read reverse range from stream ${key}`, key, error as Error);
    }
  }
}
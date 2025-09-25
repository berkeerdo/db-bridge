import { StreamBaseTrait } from './stream-base-trait';

export class StreamCrudTrait extends StreamBaseTrait {
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
      this.throwError(`Failed to add to stream ${key}`, key, error as Error);
    }
  }

  async xdel(key: string, ...ids: string[]): Promise<number> {
    try {
      return await this.client.xdel(key, ...ids);
    } catch (error) {
      this.throwError(`Failed to delete from stream ${key}`, key, error as Error);
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
      this.throwError(`Failed to trim stream ${key}`, key, error as Error);
    }
  }

  async xlen(key: string): Promise<number> {
    try {
      return await this.client.xlen(key);
    } catch (error) {
      this.throwError(`Failed to get stream length ${key}`, key, error as Error);
    }
  }
}
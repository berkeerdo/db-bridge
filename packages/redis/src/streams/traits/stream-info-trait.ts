import { StreamConsumerTrait, ConsumerGroupInfo } from './stream-consumer-trait';
import { StreamInfo } from './stream-base-trait';

export class StreamInfoTrait extends StreamConsumerTrait {
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
      this.throwError(`Failed to get info for stream ${key}`, key, error as Error);
    }
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
}
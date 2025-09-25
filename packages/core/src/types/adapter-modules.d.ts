// Type declarations for adapter modules
declare module '@db-bridge/redis' {
  import { DatabaseAdapter } from '../interfaces';
  
  export class RedisAdapter extends DatabaseAdapter {
    constructor(options?: any);
  }
}

declare module '@db-bridge/mysql' {
  import { DatabaseAdapter } from '../interfaces';
  
  export class MySQLAdapter extends DatabaseAdapter {
    constructor(options?: any);
  }
}

declare module '@db-bridge/postgresql' {
  import { DatabaseAdapter } from '../interfaces';
  
  export class PostgreSQLAdapter extends DatabaseAdapter {
    constructor(options?: any);
  }
}
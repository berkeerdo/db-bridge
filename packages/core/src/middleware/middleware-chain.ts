/**
 * Middleware Chain
 *
 * Manages and executes middleware in a chain pattern.
 * Middleware are executed in order, each can modify context
 * or short-circuit the chain.
 *
 * @example
 * ```typescript
 * const chain = new MiddlewareChain()
 *   .use(cacheMiddleware)
 *   .use(retryMiddleware)
 *   .use(timeoutMiddleware)
 *   .use(loggingMiddleware);
 *
 * const result = await chain.execute(context, finalHandler);
 * ```
 */

import type {
  QueryMiddleware,
  QueryMiddlewareContext,
  QueryMiddlewareResult,
  NextMiddleware,
} from './types';

export class MiddlewareChain<T = unknown> {
  private middlewares: QueryMiddleware<T>[] = [];

  /**
   * Add middleware to the chain
   */
  use(middleware: QueryMiddleware<T>): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Remove middleware from the chain
   */
  remove(middleware: QueryMiddleware<T>): this {
    const index = this.middlewares.indexOf(middleware);
    if (index !== -1) {
      this.middlewares.splice(index, 1);
    }
    return this;
  }

  /**
   * Clear all middleware
   */
  clear(): this {
    this.middlewares = [];
    return this;
  }

  /**
   * Get count of middleware in chain
   */
  get length(): number {
    return this.middlewares.length;
  }

  /**
   * Execute the middleware chain
   */
  async execute(
    context: QueryMiddlewareContext,
    finalHandler: NextMiddleware<T>,
  ): Promise<QueryMiddlewareResult<T>> {
    // Build the chain from right to left
    let next: NextMiddleware<T> = finalHandler;

    for (let i = this.middlewares.length - 1; i >= 0; i--) {
      const middleware = this.middlewares[i]!;
      const currentNext = next;
      next = (ctx) => middleware(ctx, currentNext);
    }

    return next(context);
  }

  /**
   * Create a new context for query execution
   */
  static createContext(
    sql: string,
    params: unknown[],
    options?: QueryMiddlewareContext['options'],
  ): QueryMiddlewareContext {
    return {
      sql,
      params,
      options,
      startTime: Date.now(),
      metadata: {},
    };
  }
}

/**
 * Compose multiple middleware into a single middleware
 */
export function composeMiddleware<T = unknown>(
  ...middlewares: QueryMiddleware<T>[]
): QueryMiddleware<T> {
  return async (context, next) => {
    const chain = new MiddlewareChain<T>();
    middlewares.forEach((m) => chain.use(m));
    return chain.execute(context, next);
  };
}

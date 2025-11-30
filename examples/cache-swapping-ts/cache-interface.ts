/**
 * Cache Interface
 *
 * Defines the contract that all cache implementations must follow.
 * This allows us to swap implementations without changing dependent code.
 *
 * This is the power of programming to interfaces - the API service doesn't
 * care if it's talking to Redis or in-memory cache, as long as it implements
 * this interface.
 */

export interface CacheInterface {
  /** The type of cache implementation */
  type: string;

  /** Set a value with optional TTL in seconds */
  set(key: string, value: any, ttl?: number): Promise<void>;

  /** Get a value by key */
  get(key: string): Promise<any>;

  /** Check if key exists */
  has(key: string): Promise<boolean>;

  /** Delete a key */
  delete(key: string): Promise<void>;

  /** Clear all keys */
  clear(): Promise<void>;

  /** Get number of keys */
  size(): Promise<number>;

  /** Get cache statistics */
  stats(): Promise<{
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
    size: number;
    hitRate: number;
  }>;
}

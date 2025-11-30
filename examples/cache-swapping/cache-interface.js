/**
 * Cache Interface
 * 
 * Defines the contract that all cache implementations must follow.
 * This allows us to swap implementations without changing dependent code.
 */

/**
 * @typedef {Object} CacheInterface
 * @property {(key: string, value: any, ttl?: number) => Promise<void>} set - Set a value with optional TTL in seconds
 * @property {(key: string) => Promise<any>} get - Get a value by key
 * @property {(key: string) => Promise<boolean>} has - Check if key exists
 * @property {(key: string) => Promise<void>} delete - Delete a key
 * @property {() => Promise<void>} clear - Clear all keys
 * @property {() => Promise<number>} size - Get number of keys
 * @property {() => Promise<Object>} stats - Get cache statistics
 */

module.exports = {};


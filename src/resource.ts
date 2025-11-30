/**
 * Resource System - Core Types
 *
 * Inspired by Clojure's integrant library, this module provides a declarative,
 * data-driven approach to managing stateful resources with explicit lifecycle
 * and dependency injection.
 */

/**
 * Defines the configuration for a stateful resource.
 *
 * @template Deps - Record of dependency names to their types
 * @template T - The type of the resource instance returned by start()
 */
export type ResourceConfig<TDeps extends Record<string, any> = any, T = any> = {
  /** Array of resource IDs this resource depends on */
  dependencies?: Array<keyof TDeps>;
  /**
   * Assert that the dependencies are valid.
   * @param deps - The dependencies to assert
   * @returns void, should throw if the dependencies are invalid
   */
  assert?: (deps: TDeps) => void | Promise<void>;

  /**
   * Start the resource, receiving resolved dependencies.
   * Can be async for resources that need async initialization.
   *
   * @param deps - Resolved dependency instances
   * @returns The started resource instance
   */
  start: (deps: TDeps) => T | Promise<T>;

  /**
   * Halt the resource, receiving the started instance.
   * Called in reverse dependency order during system shutdown.
   *
   * @param instance - The resource instance to halt
   */
  halt: (instance: T) => void | Promise<void>;
};

/**
 * Resource lifecycle statuses.
 *
 * - stopped: Initial state, not yet started
 * - starting: start() function is executing
 * - started: Successfully started and operational
 * - failed: start() threw an error
 * - halting: halt() function is executing
 */
export type ResourceStatus =
  | "stopped"
  | "starting"
  | "started"
  | "failed"
  | "halting";

/**
 * A resource with runtime state tracking.
 * Internal type used by the resource system orchestrator.
 */
export type Resource<
  TDeps extends Record<string, any> = any,
  T = any
> = ResourceConfig<TDeps, T> & {
  _status: ResourceStatus;
  _instance?: T;
  _error?: Error;
};

export type StartedResource<T extends ResourceConfig> = Awaited<
  ReturnType<T["start"]>
>;

/**
 * A system configuration is a record of resource IDs to resource configs.
 * Accepts resources with any dependency types.
 */
export type SystemConfig = Record<string, ResourceConfig>;

/**
 * A started system maps resource IDs to their started instances.
 * Type-safe extraction of instance types from resource configs.
 */
export type StartedSystem<TConfig extends SystemConfig> = {
  [K in keyof TConfig]: TConfig[K] extends ResourceConfig<any, infer T>
    ? T
    : never;
};

/**
 * Result of starting a system, including the started instances and any errors.
 */
export type SystemStartResult<TConfig extends SystemConfig> = {
  /** The started system with all resource instances */
  system: StartedSystem<TConfig>;
  /** Map of resource IDs to errors that occurred during startup */
  errors: Map<string, Error>;
};

/**
 * Result of halting a system, including any errors that occurred.
 */
export type SystemHaltResult = {
  /** Map of resource IDs to errors that occurred during shutdown */
  errors: Map<string, Error>;
};

/**
 * Helper function to define a resource with full type inference.
 * Ensures dependencies are properly typed and provides IDE autocomplete.
 *
 * @example
 * ```typescript
 * const counterResource = defineResource({
 *   start: () => ({ count: 0, increment: () => count++ }),
 *   halt: (counter) => console.log('Final count:', counter.count)
 * })
 *
 * const loggerResource = defineResource({
 *   dependencies: ['counter'],
 *   start: ({ counter }) => new Logger(counter),
 *   halt: (logger) => logger.close()
 * })
 * ```
 */
export function defineResource<
  TDeps extends Record<string, any> = any,
  T = any
>(config: ResourceConfig<TDeps, T>): ResourceConfig<TDeps, T> {
  return config;
}

/**
 * Resource System - Core Types
 *
 * Inspired by Clojure's integrant library, this module provides a declarative,
 * data-driven approach to managing stateful resources with explicit lifecycle
 * and dependency injection.
 */

/**
 * Expand - Utility type that forces TypeScript to expand type aliases
 * This makes hover tooltips show the full type definition instead of just the alias name
 *
 * Borrowed from Emergent's type system for consistent developer experience.
 */
type Expand<T> = T extends (...args: any[]) => any
  ? T
  : T extends object
  ? { [K in keyof T]: T[K] } & {}
  : T;

/**
 * Bivariant callback helper.
 *
 * We intentionally make callback parameter types bivariant for ergonomics, so users can write:
 * `assert: ({ base }: { base: Base }) => { ... }` even if inferred deps is a wider record type.
 *
 * This mirrors how many TS libraries type event/callback handlers.
 */
type BivariantCallback<TArg, TReturn> = {
  bivarianceHack(arg: TArg): TReturn;
}["bivarianceHack"];

/**
 * Infer dependencies from the start function's first parameter
 */
type InferDeps<TStart extends (...args: any[]) => any> =
  Parameters<TStart> extends [infer D, ...any[]] ? D : Record<string, unknown>;

/**
 * Infer resource instance type from start function's return type
 */
type InferResource<TStart> = Awaited<
  ReturnType<Extract<TStart, (...args: any[]) => any>>
>;

/**
 * Dependency specification for resources.
 *
 * - Array form: all dependencies are required (default ergonomic path)
 * - Object form: split required vs optional dependencies (optional enables graceful degradation)
 */
export type DependenciesSpec<TDepId extends PropertyKey = string> =
  | ReadonlyArray<TDepId>
  | {
      required?: ReadonlyArray<TDepId>;
      optional?: ReadonlyArray<TDepId>;
    };

/**
 * Defines the configuration for a stateful resource.
 *
 * Dependencies are automatically inferred from the start function's parameter.
 * Resource type is automatically inferred from the start function's return type.
 *
 * @template TStart - The start function type (dependencies and return type inferred from this)
 */
export type ResourceConfig<
  TStart extends (...args: any[]) => any = (
    deps: Record<string, unknown>
  ) => any
> = {
  /** Dependencies this resource depends on (required by default; can be split into required/optional) */
  dependencies?: DependenciesSpec<keyof InferDeps<TStart>>;

  /**
   * Assert that the dependencies are valid.
   * @param deps - The dependencies to assert (type inferred from start parameter)
   * @returns void, should throw if the dependencies are invalid
   */
  assert?: BivariantCallback<Expand<InferDeps<TStart>>, void | Promise<void>>;

  /**
   * Start the resource, receiving resolved dependencies.
   * Can be async for resources that need async initialization.
   *
   * @param deps - Resolved dependency instances (type defines the shape)
   * @returns The started resource instance
   */
  start: TStart;

  /**
   * Halt the resource, receiving the started instance.
   * Called in reverse dependency order during system shutdown.
   *
   * @param instance - The resource instance to halt (type inferred from start return)
   */
  halt: (instance: Expand<InferResource<TStart>>) => void | Promise<void>;
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
  | "skipped"
  | "halting";

/**
 * A resource with runtime state tracking.
 * Internal type used by the resource system orchestrator.
 */
export type Resource<
  TStart extends (...args: any[]) => any = (
    deps: Record<string, unknown>
  ) => any
> = ResourceConfig<TStart> & {
  _status: ResourceStatus;
  _instance?: InferResource<TStart>;
  _error?: Error;
};

/**
 * Extract the started resource type from a ResourceConfig
 *
 * This uses Expand to show the full type definition in IDE tooltips
 * instead of just showing the type alias name.
 */
export type StartedResource<T extends ResourceConfig<any>> =
  T extends ResourceConfig<infer TStart>
    ? Expand<InferResource<TStart>>
    : never;

/**
 * A system configuration is a record of resource IDs to resource configs.
 * Accepts resources with any dependency types.
 */
export type SystemConfig = Record<string, ResourceConfig<any>>;

/**
 * A started system maps resource IDs to their started instances.
 * Type-safe extraction of instance types from resource configs.
 */
export type StartedSystem<TConfig extends SystemConfig> = {
  [K in keyof TConfig]: StartedResource<TConfig[K]>;
};

/**
 * Result of starting a system, including the started instances and any errors.
 */
export type SystemStartResult<TConfig extends SystemConfig> = {
  /** The started system with all resource instances */
  system: StartedSystem<TConfig>;
  /** Map of resource IDs to errors that occurred during startup */
  errors: Map<string, Error>;
  /** Topology graph showing dependency structure */
  topology: import("./topology").SystemTopology;
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
 *
 * Dependencies are inferred from the start function's parameter type.
 * Resource type is inferred from the start function's return type.
 * The halt function's parameter is automatically typed based on start's return.
 *
 * @example
 * ```typescript
 * // No dependencies - simple resource
 * const counterResource = defineResource({
 *   start: () => ({ count: 0, increment: () => count++ }),
 *   halt: (counter) => console.log('Final count:', counter.count)
 * })
 *
 * // With dependencies - types inferred from parameter
 * const loggerResource = defineResource({
 *   dependencies: ['counter'],
 *   start: ({ counter }: { counter: StartedResource<typeof counterResource> }) => {
 *     return new Logger(counter)
 *   },
 *   halt: (logger) => logger.close() // logger type inferred!
 * })
 *
 * // Alternative: inline type for better IDE support
 * type LoggerDeps = {
 *   counter: StartedResource<typeof counterResource>;
 * }
 *
 * const loggerResource = defineResource({
 *   dependencies: ['counter'] as const,
 *   start: ({ counter }: LoggerDeps) => new Logger(counter),
 *   halt: (logger) => logger.close()
 * })
 * ```
 */
export function defineResource<
  TStart extends (...args: any[]) => any
>(
  // Force inference of TStart from `start` specifically to avoid TS inferring
  // an artificial deps shape (e.g. `{}`) when `start` is parameterless.
  config: { start: TStart } & Omit<ResourceConfig<TStart>, "start">
): ResourceConfig<TStart> {
  return config;
}

/**
 * Resource System - Orchestrator
 *
 * Manages the lifecycle of resources with dependency-aware start/halt ordering.
 * Uses topological sort to ensure resources start in dependency order and halt
 * in reverse order.
 */

import type {
  Resource,
  StartedSystem,
  SystemConfig,
  SystemStartResult,
  SystemHaltResult,
} from "./resource";
import { topologicalSort } from "./topological-sort";
import { buildTopology } from "./topology";

/**
 * Starts all resources in a system configuration in dependency order.
 *
 * Resources are started using topological sort based on their declared dependencies.
 * If a resource fails to start, the error is collected in the errors map and the
 * resource is marked as 'failed', but the system continues starting other resources
 * (graceful degradation). Dependent resources will receive `undefined` for failed
 * dependencies.
 *
 * @param config - System configuration mapping resource IDs to resource configs
 * @returns Promise resolving to object with started system and any errors
 * @throws Error if circular dependencies are detected
 *
 * @example
 * ```typescript
 * const { system, errors, topology } = await startSystem({
 *   store: storeResource,
 *   runtime: runtimeResource, // depends on store
 *   network: networkResource   // depends on runtime
 * })
 * // system.store, system.runtime, system.network are now started
 * // Check errors.size to see if any resources failed
 * // topology is a graph/layer representation of the system's dependency structure
 * ```
 */
export async function startSystem<TConfig extends SystemConfig>(
  config: TConfig
): Promise<SystemStartResult<TConfig>> {
  const started: Record<string, any> = {};
  const resources: Record<string, Resource> = {};
  const errors = new Map<string, Error>();

  // Convert config to resources with state tracking
  for (const [id, resourceConfig] of Object.entries(config)) {
    resources[id] = {
      ...resourceConfig,
      _status: "stopped",
    };
  }

  // Get dependency-ordered list of resource IDs
  const order = topologicalSort(resources);

  // Build topology for visualization
  const topology = buildTopology(resources, order);

  // Start each resource in order
  for (const id of order) {
    const resource = resources[id]!;

    try {
      resource._status = "starting";

      // Resolve dependencies from already-started resources
      const deps = resolveDependencies(resource, started);
      const errorDetected = await (async () => {
        try {
          await resource.assert?.(deps);
          return null;
        } catch (error) {
          return error;
        }
      })();
      if (errorDetected) {
        const error = new Error(`Invalid dependencies for resource "${id}"`);
        error.cause = errorDetected;
        throw error;
      }
      const instance = await resource.start(deps);

      resource._instance = instance;
      resource._status = "started";
      started[id] = instance;
    } catch (error) {
      const err = error as Error;
      resource._status = "failed";
      resource._error = err;
      errors.set(id, err);
      // Graceful degradation: mark as undefined so dependents can handle it
      started[id] = undefined;
    }
  }

  return {
    system: started as StartedSystem<TConfig>,
    errors,
    topology,
  };
}

/**
 * Halts all resources in a started system in reverse dependency order.
 *
 * Resources are halted in the reverse order they were started, ensuring that
 * resources are stopped before their dependencies. Errors during halt are collected
 * in the errors map but don't prevent other resources from halting.
 *
 * @param config - Original system configuration
 * @param started - Started system instance to halt
 * @returns Promise resolving to object with any halt errors
 *
 * @example
 * ```typescript
 * const { errors } = await haltSystem(config, system)
 * // All resources are now halted in reverse order
 * // Check errors.size to see if any resources failed to halt
 * ```
 */
export async function haltSystem<TConfig extends SystemConfig>(
  config: TConfig,
  started: StartedSystem<TConfig>
): Promise<SystemHaltResult> {
  const resources: Record<string, Resource> = {};
  const errors = new Map<string, Error>();

  // Reconstruct resources with their instances
  for (const [id, resourceConfig] of Object.entries(config)) {
    resources[id] = {
      ...resourceConfig,
      _status: "started",
      _instance: started[id as keyof TConfig],
    };
  }

  // Get reverse dependency order
  const order = topologicalSort(resources).reverse();

  // Halt each resource in reverse order
  for (const id of order) {
    const resource = resources[id]!;

    if (resource._instance && resource._status === "started") {
      try {
        resource._status = "halting";
        await resource.halt(resource._instance);
        resource._status = "stopped";
        resource._instance = undefined;
      } catch (error) {
        errors.set(id, error as Error);
      }
    }
  }

  return { errors };
}

/**
 * Resolves dependencies for a resource from the started resources map.
 *
 * Builds a record mapping dependency names to their started instances.
 * If a dependency failed to start, it will be `undefined` in the result.
 *
 * @param resource - Resource whose dependencies to resolve
 * @param started - Map of already-started resource instances
 * @returns Record of dependency names to instances
 */
function resolveDependencies(
  resource: Resource,
  started: Record<string, any>
): Record<string, any> {
  const deps: Record<string, any> = {};

  for (const depId of resource.dependencies || []) {
    deps[depId as string] = started[depId as string];
  }

  return deps;
}

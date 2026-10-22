/**
 * Resource System - Reconciliation
 *
 * Moves a started system to a next configuration without restarting what
 * didn't change. A started system is a value, the pair (config, started):
 * reconciling computes the next pair and never mutates the previous one.
 */

import type {
  Resource,
  StartedSystem,
  SystemConfig,
  SystemReconcileResult,
} from "./resource";
import { normalizeDependencies } from "./dependencies";
import { topologicalSort } from "./topological-sort";
import { buildTopology } from "./topology";
import { publicView, startInOrder, UNAVAILABLE } from "./system";

/**
 * Reconciles a started system with a next configuration.
 *
 * Resources are compared by key and by identity (`prev[id] !== next[id]`):
 * - removed and changed resources are halted, with every resource that depends
 *   on them, directly or not, in reverse dependency order (using the previous
 *   configuration's `halt`)
 * - changed and added resources are started, with every resource that depends
 *   on them, in dependency order, receiving the untouched instances and the
 *   ones just started
 * - every other resource keeps its instance, untouched
 *
 * A dependent is always restarted with what it depends on, so no instance
 * holds a reference to a halted one.
 *
 * Restarting a resource whose configuration is unchanged is a reconcile with a
 * copy of its entry: `reconcileSystem(config, started, { ...config, db: { ...config.db } })`.
 *
 * A resource whose instance in `started` is `undefined` counts as unavailable
 * (it failed, was skipped, or was never started), as in `haltSystem`. It stays
 * so unless it is changed or depends on something restarted.
 *
 * @param prevConfig - The configuration `started` was started from
 * @param started - The started system to move from
 * @param nextConfig - The configuration to move to
 * @returns Promise resolving to the next started system, its errors and what moved
 * @throws Error if the next configuration has a circular or missing dependency,
 *   before anything is halted
 */
export async function reconcileSystem<
  TPrev extends SystemConfig,
  TNext extends SystemConfig
>(
  prevConfig: TPrev,
  started: StartedSystem<TPrev>,
  nextConfig: TNext
): Promise<SystemReconcileResult<TNext>> {
  const prev = asResources(prevConfig);
  const next = asResources(nextConfig);
  const nextOrder = topologicalSort(next);
  const prevOrder = topologicalSort(prev);

  const moved = Object.keys(prevConfig).filter(
    (id) => prevConfig[id] !== nextConfig[id]
  );
  const added = Object.keys(nextConfig).filter((id) => !(id in prevConfig));

  const toHalt = withDependents(prev, moved);
  const toStart = new Set([
    ...[...toHalt].filter((id) => id in nextConfig),
    ...withDependents(
      next,
      [...moved, ...added].filter((id) => id in nextConfig)
    ),
  ]);

  const previous = started as Record<string, unknown>;
  const halted: string[] = [];
  const haltErrors = new Map<string, Error>();
  for (const id of [...prevOrder].reverse()) {
    if (!toHalt.has(id) || previous[id] === undefined) continue;
    halted.push(id);
    try {
      await prev[id]!.halt(previous[id]);
    } catch (error) {
      haltErrors.set(id, error as Error);
    }
  }

  const startedInternal: Record<string, any> = {};
  for (const id of nextOrder) {
    if (toStart.has(id)) continue;
    startedInternal[id] = previous[id] === undefined ? UNAVAILABLE : previous[id];
  }

  const startOrder = nextOrder.filter((id) => toStart.has(id));
  const errors = new Map<string, Error>();
  await startInOrder(next, startOrder, startedInternal, errors);

  const view = publicView(startedInternal);
  const system: Record<string, any> = {};
  for (const id of nextOrder) system[id] = view[id];

  return {
    system: system as StartedSystem<TNext>,
    errors,
    haltErrors,
    topology: buildTopology(next, nextOrder),
    halted,
    started: startOrder,
  };
}

function asResources(config: SystemConfig): Record<string, Resource> {
  const resources: Record<string, Resource> = {};
  for (const [id, resourceConfig] of Object.entries(config)) {
    resources[id] = { ...resourceConfig, _status: "stopped" };
  }
  return resources;
}

/** The given IDs and every resource that depends on one of them, directly or not */
function withDependents(
  resources: Record<string, Resource>,
  ids: ReadonlyArray<string>
): Set<string> {
  const dependents: Record<string, string[]> = {};
  for (const [id, resource] of Object.entries(resources)) {
    for (const dep of normalizeDependencies(resource.dependencies).all) {
      (dependents[dep] ??= []).push(id);
    }
  }
  const reached = new Set<string>();
  const queue = [...ids];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (reached.has(id)) continue;
    reached.add(id);
    queue.push(...(dependents[id] ?? []));
  }
  return reached;
}

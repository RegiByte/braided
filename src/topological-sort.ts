import { Resource } from "./resource";

/**
 * Performs topological sort on resources using Kahn's algorithm.
 *
 * @reference https://en.wikipedia.org/wiki/Topological_sorting
 *
 * Returns an array of resource IDs in dependency order (dependencies before dependents).
 * Detects circular dependencies and throws an error if found.
 *
 * @param resources - Record of resource IDs to resource instances
 * @returns Array of resource IDs in topological order
 * @throws Error if circular dependency is detected
 */
export function topologicalSort(
  resources: Record<string, Resource>
): Array<string> {
  const inDegree: Record<string, number> = {};
  const graph: Record<string, Array<string>> = {};

  // Initialize graph structures
  for (const id of Object.keys(resources)) {
    inDegree[id] = 0;
    graph[id] = [];
  }

  // Build dependency graph
  // If resource A depends on B, then B -> A in the graph
  for (const [id, resource] of Object.entries(resources)) {
    for (const dep of resource.dependencies || []) {
      const depId = dep as string;
      if (!graph[depId]) {
        throw new Error(
          `Resource "${id}" depends on "${depId}" which doesn't exist in the system config`
        );
      }
      graph[depId].push(id);
      inDegree[id] = (inDegree[id] || 0) + 1;
    }
  }

  // Kahn's algorithm: start with nodes that have no dependencies
  const queue: Array<string> = [];
  const result: Array<string> = [];

  for (const [id, degree] of Object.entries(inDegree)) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  // Process nodes in dependency order
  while (queue.length > 0) {
    const id = queue.shift()!;
    result.push(id);

    // Remove edges from this node and add newly-free nodes to queue
    for (const dependent of graph[id]!) {
      inDegree[dependent] = inDegree[dependent]! - 1;
      if (inDegree[dependent] === 0) {
        queue.push(dependent);
      }
    }
  }

  // If we didn't process all nodes, there's a cycle
  if (result.length !== Object.keys(resources).length) {
    const unprocessed = Object.keys(resources).filter(
      (id) => !result.includes(id)
    );
    throw new Error(
      `Circular dependency detected in resource system. Unprocessed resources: ${unprocessed.join(
        ", "
      )}`
    );
  }

  return result;
}

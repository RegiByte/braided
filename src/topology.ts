/**
 * System Topology - Dependency Graph Visualization
 *
 * Provides structured views of resource dependency graphs for visualization,
 * debugging, and documentation purposes.
 */

import type { Resource } from "./resource";

/**
 * A resource node in the topology graph
 */
export type TopologyNode = {
  /** Resource ID */
  id: string;
  /** IDs of resources this resource depends on */
  dependencies: string[];
  /** IDs of resources that depend on this resource */
  dependents: string[];
  /** Depth in the dependency tree (0 = no dependencies) */
  depth: number;
};

/**
 * A layer in the dependency hierarchy
 */
export type TopologyLayer = {
  /** Depth level (0 = no dependencies) */
  depth: number;
  /** Resources at this depth level */
  resources: TopologyNode[];
};

/**
 * Complete topology of a resource system
 */
export type SystemTopology = {
  /** Resources organized by dependency depth */
  layers: TopologyLayer[];

  /** Adjacency list: resource -> its dependencies */
  graph: Record<string, string[]>;

  /** Reverse adjacency list: resource -> what depends on it */
  dependents: Record<string, string[]>;

  /** Map of resource IDs to their depth in the tree */
  depths: Record<string, number>;

  /** Total number of resources in the system */
  totalResources: number;

  /** Maximum depth of the dependency tree */
  maxDepth: number;

  /** Startup order (topologically sorted) */
  startupOrder: string[];

  /** Shutdown order (reverse of startup) */
  shutdownOrder: string[];
};

/**
 * Builds a topology graph from resources and their startup order.
 *
 * The topology provides multiple views of the dependency graph:
 * - Layers organized by depth
 * - Adjacency lists (forward and reverse)
 * - Startup/shutdown order
 *
 * @param resources - Record of resource IDs to resource instances
 * @param order - Topologically sorted order of resource IDs
 * @returns Complete topology structure
 *
 * @example
 * ```typescript
 * const resources = { ... };
 * const order = topologicalSort(resources);
 * const topology = buildTopology(resources, order);
 *
 * console.log(`System has ${topology.totalResources} resources`);
 * console.log(`Maximum depth: ${topology.maxDepth}`);
 * topology.layers.forEach(layer => {
 *   console.log(`Layer ${layer.depth}:`, layer.resources.map(r => r.id));
 * });
 * ```
 */
export function buildTopology(
  resources: Record<string, Resource>,
  order: string[]
): SystemTopology {
  // Build forward graph (resource -> dependencies)
  const graph: Record<string, string[]> = {};
  for (const id of Object.keys(resources)) {
    graph[id] = [...(resources[id].dependencies || [])] as string[];
  }

  // Build reverse graph (resource -> dependents)
  const dependents: Record<string, string[]> = {};
  for (const id of Object.keys(resources)) {
    dependents[id] = [];
  }
  for (const [id, deps] of Object.entries(graph)) {
    for (const dep of deps) {
      dependents[dep].push(id);
    }
  }

  // Calculate depth for each resource
  // Depth = max(depth of dependencies) + 1, or 0 if no dependencies
  const depths: Record<string, number> = {};
  for (const id of order) {
    const deps = graph[id];
    if (deps.length === 0) {
      depths[id] = 0;
    } else {
      depths[id] = Math.max(...deps.map((dep) => depths[dep])) + 1;
    }
  }

  // Find maximum depth
  const maxDepth = Object.keys(depths).length > 0
    ? Math.max(...Object.values(depths))
    : 0;

  // Group resources by depth into layers
  const layers: TopologyLayer[] = [];
  for (let depth = 0; depth <= maxDepth; depth++) {
    const resourcesAtDepth = Object.entries(depths)
      .filter(([_, d]) => d === depth)
      .map(([id]) => ({
        id,
        dependencies: graph[id],
        dependents: dependents[id],
        depth,
      }));

    layers.push({ depth, resources: resourcesAtDepth });
  }

  return {
    layers,
    graph,
    dependents,
    depths,
    totalResources: Object.keys(resources).length,
    maxDepth,
    startupOrder: [...order],
    shutdownOrder: [...order].reverse(),
  };
}

/**
 * Formats topology as a human-readable string.
 *
 * @param topology - System topology to format
 * @returns Formatted string representation
 *
 * @example
 * ```typescript
 * const { topology } = await startSystem(config);
 * console.log(formatTopology(topology));
 * ```
 */
export function formatTopology(topology: SystemTopology): string {
  const lines: string[] = [];

  lines.push(
    `🧶 System Topology (${topology.totalResources} resources, max depth: ${topology.maxDepth})`
  );
  lines.push("");

  for (const layer of topology.layers) {
    lines.push(`Layer ${layer.depth}:`);
    for (const resource of layer.resources) {
      const deps =
        resource.dependencies.length > 0
          ? ` ← [${resource.dependencies.join(", ")}]`
          : " (no dependencies)";
      const dependents =
        resource.dependents.length > 0
          ? ` → [${resource.dependents.join(", ")}]`
          : "";
      lines.push(`  • ${resource.id}${deps}${dependents}`);
    }
    lines.push("");
  }

  lines.push(`Startup order: ${topology.startupOrder.join(" → ")}`);
  lines.push(`Shutdown order: ${topology.shutdownOrder.join(" → ")}`);

  return lines.join("\n");
}

/**
 * Converts topology to Mermaid diagram format.
 *
 * @param topology - System topology to convert
 * @param direction - Graph direction ('TB' = top-bottom, 'LR' = left-right)
 * @returns Mermaid diagram as string
 *
 * @example
 * ```typescript
 * const { topology } = await startSystem(config);
 * console.log(toMermaid(topology));
 * // Copy output to markdown file:
 * // ```mermaid
 * // graph TD
 * //   config --> database
 * //   ...
 * // ```
 * ```
 */
export function toMermaid(
  topology: SystemTopology,
  direction: "TB" | "LR" = "TB"
): string {
  const lines: string[] = [];
  lines.push(`graph ${direction}`);

  // Add nodes without dependencies first
  const nodesWithoutDeps = Object.entries(topology.graph)
    .filter(([_, deps]) => deps.length === 0)
    .map(([id]) => id);

  if (nodesWithoutDeps.length > 0) {
    for (const id of nodesWithoutDeps) {
      lines.push(`  ${id}`);
    }
  }

  // Add edges
  for (const [resource, deps] of Object.entries(topology.graph)) {
    for (const dep of deps) {
      lines.push(`  ${dep} --> ${resource}`);
    }
  }

  return lines.join("\n");
}

/**
 * Converts topology to GraphViz DOT format.
 *
 * @param topology - System topology to convert
 * @param direction - Graph direction ('TB' = top-bottom, 'LR' = left-right)
 * @returns DOT format as string
 *
 * @example
 * ```typescript
 * const { topology } = await startSystem(config);
 * const dot = toDot(topology);
 * // Save to file and render with: dot -Tpng system.dot -o system.png
 * ```
 */
export function toDot(
  topology: SystemTopology,
  direction: "TB" | "LR" = "TB"
): string {
  const lines: string[] = [];
  lines.push("digraph SystemTopology {");
  lines.push(`  rankdir=${direction};`);
  lines.push("  node [shape=box, style=rounded];");
  lines.push("");

  // Group nodes by rank (depth)
  for (const layer of topology.layers) {
    const nodeIds = layer.resources.map((r) => r.id).join("; ");
    lines.push(`  { rank=same; ${nodeIds} }`);
  }

  lines.push("");

  // Add edges
  for (const [resource, deps] of Object.entries(topology.graph)) {
    for (const dep of deps) {
      lines.push(`  ${dep} -> ${resource};`);
    }
  }

  lines.push("}");
  return lines.join("\n");
}

/**
 * Converts topology to a simple adjacency list format (JSON-friendly).
 *
 * @param topology - System topology to convert
 * @returns Simple object representation
 *
 * @example
 * ```typescript
 * const { topology } = await startSystem(config);
 * const json = JSON.stringify(toJSON(topology), null, 2);
 * fs.writeFileSync('topology.json', json);
 * ```
 */
export function toJSON(topology: SystemTopology): Record<string, any> {
  return {
    totalResources: topology.totalResources,
    maxDepth: topology.maxDepth,
    startupOrder: topology.startupOrder,
    shutdownOrder: topology.shutdownOrder,
    layers: topology.layers.map((layer) => ({
      depth: layer.depth,
      resources: layer.resources.map((r) => ({
        id: r.id,
        dependencies: r.dependencies,
        dependents: r.dependents,
      })),
    })),
    graph: topology.graph,
  };
}


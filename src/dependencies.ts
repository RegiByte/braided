import type { DependenciesSpec } from "./resource";

export type NormalizedDependencies = {
  required: readonly string[];
  optional: readonly string[];
  all: readonly string[];
};

export function normalizeDependencies(
  deps: DependenciesSpec | undefined
): NormalizedDependencies {
  if (!deps) return { required: [], optional: [], all: [] };

  // Array form: all required (default ergonomic path)
  if (Array.isArray(deps)) {
    const required = [...deps].map(String);
    return { required, optional: [], all: required };
  }

  const dualSpec = deps as {
    required?: readonly string[];
    optional?: readonly string[];
  };

  const required = dualSpec.required ?? [];
  const optional = dualSpec.optional ?? [];

  // Preserve order: required first, then optional, de-dup
  const seen = new Set<string>();
  const all: string[] = [];
  for (const id of [...required, ...optional]) {
    if (seen.has(id)) continue;
    seen.add(id);
    all.push(id);
  }

  return { required, optional, all };
}

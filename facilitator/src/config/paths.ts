import { existsSync } from "node:fs";
import { resolve, dirname, isAbsolute } from "node:path";

/**
 * Walks up the directory tree from `start` looking for a `pnpm-workspace.yaml`
 * or `.git` marker, and returns the first directory that contains either.
 *
 * Used to resolve relative paths in env vars against the repo root rather than
 * `process.cwd()`, which varies depending on whether the process was started
 * via `npm -w <workspace> run dev` (cwd = workspace dir) or from the repo root.
 */
export function resolveRepoRoot(start: string): string {
  let dir = resolve(start);
  while (dir !== "/") {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml")) || existsSync(resolve(dir, ".git"))) {
      return dir;
    }
    dir = dirname(dir);
  }
  throw new Error("could not locate repository root (no pnpm-workspace.yaml or .git found)");
}

/**
 * Resolves `value` as a path:
 * - If already absolute, returns as-is.
 * - If relative, resolves against the repo root (NOT process.cwd).
 */
export function resolvePathFromRepoRoot(value: string): string {
  if (isAbsolute(value)) return value;
  const repoRoot = resolveRepoRoot(process.cwd());
  return resolve(repoRoot, value);
}

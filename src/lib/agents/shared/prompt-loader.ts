/**
 * Prompt loader — reads .md prompt files at runtime.
 *
 * Prompts live next to their agent code (e.g. wave0/agent-00a-prompt.md).
 * Loader uses Node's fs (server-only). Cached per-process to avoid disk hits
 * on every invocation.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cache = new Map<string, string>();

/**
 * Load a prompt file relative to a calling module.
 *
 * Usage:
 *   const prompt = loadPrompt(import.meta.url, 'agent-00a-prompt.md');
 */
export function loadPrompt(callerUrl: string, relativePath: string): string {
  const callerDir = dirname(fileURLToPath(callerUrl));
  const fullPath = resolve(callerDir, relativePath);

  const cached = cache.get(fullPath);
  if (cached !== undefined) return cached;

  const content = readFileSync(fullPath, 'utf-8');
  cache.set(fullPath, content);
  return content;
}

/**
 * Test-helper: clear the cache. Avoid in production.
 */
export function _clearPromptCache(): void {
  cache.clear();
}

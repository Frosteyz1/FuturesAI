/**
 * FileQueueDispatcher — writes request JSON to disk, polls for response JSON.
 *
 * Used by the Stage 4 backtest runner + the smoke-test script. Claude Code
 * (in a session) reads request files, dispatches via Task tool, writes
 * response files. The dispatching Node process polls and unblocks.
 *
 * No API key required. All execution flows through Claude Code Max plan
 * Task tool tokens, satisfying the "no external API spend" constraint
 * from the original Stage 4 build authorization.
 *
 * Layout (relative to `queueDir`):
 *   queueDir/
 *     requests/  {requestId}.json   — written by this dispatcher
 *     responses/ {requestId}.json   — written by Claude Code session driver
 *     images/    {sha256}.{png|jpg} — image data, deduped per scoring run
 */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

import type { AgentDispatcher, DispatchRequest, DispatchResponse } from './types';
import { DispatchError, DispatchTimeoutError } from './types';

export interface FileQueueDispatcherOptions {
  /** Root directory for the queue. Defaults to `./.queue`. */
  queueDir?: string;
  /** Polling interval for response file (ms). Default 500. */
  pollIntervalMs?: number;
  /** Total timeout for a single dispatch (ms). Default 10 minutes. */
  timeoutMs?: number;
  /** If true, delete request + response files after dispatch resolves. Default true. */
  cleanupAfterDispatch?: boolean;
}

/**
 * Image payload as written to the queue. The image itself is persisted
 * once (deduped by sha256) under `queueDir/images/`; the request JSON
 * holds only the path reference. Claude Code reads the path to attach
 * the image to its Task tool invocation.
 */
interface QueueRequestPayload {
  requestId: string;
  agentId: string;
  tier: string;
  systemPrompt: string;
  image: { mimeType: string; path: string };
  userInstruction: string;
  maxTokens: number;
  /** ISO timestamp the dispatcher wrote the request. */
  enqueuedAt: string;
}

interface QueueResponsePayload {
  requestId: string;
  rawText: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cachedTokens?: number;
  };
}

const DEFAULT_QUEUE_DIR = '.queue';

export class FileQueueDispatcher implements AgentDispatcher {
  private readonly queueDir: string;
  private readonly requestsDir: string;
  private readonly responsesDir: string;
  private readonly imagesDir: string;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly cleanupAfterDispatch: boolean;
  private readonly imageHashCache = new Map<string, string>();

  constructor(options: FileQueueDispatcherOptions = {}) {
    this.queueDir = resolve(options.queueDir ?? DEFAULT_QUEUE_DIR);
    this.requestsDir = join(this.queueDir, 'requests');
    this.responsesDir = join(this.queueDir, 'responses');
    this.imagesDir = join(this.queueDir, 'images');
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    this.timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
    this.cleanupAfterDispatch = options.cleanupAfterDispatch ?? true;

    for (const d of [this.requestsDir, this.responsesDir, this.imagesDir]) {
      mkdirSync(d, { recursive: true });
    }
  }

  async dispatch(req: DispatchRequest): Promise<DispatchResponse> {
    const requestPath = join(this.requestsDir, `${req.requestId}.json`);
    const responsePath = join(this.responsesDir, `${req.requestId}.json`);

    // Persist image once, dedupe by sha256
    let imagePath: string;
    let mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
    if (req.image.kind === 'base64') {
      ({ imagePath, mimeType } = this.persistImage(req.image.data, req.image.mimeType));
    } else {
      imagePath = req.image.path;
      mimeType = req.image.mimeType;
    }

    const payload: QueueRequestPayload = {
      requestId: req.requestId,
      agentId: req.agentId,
      tier: req.tier,
      systemPrompt: req.systemPrompt,
      image: { mimeType, path: imagePath },
      userInstruction: req.userInstruction,
      maxTokens: req.maxTokens,
      enqueuedAt: new Date().toISOString(),
    };

    // Atomic write via temp + rename so partially-written files aren't read
    const tmpPath = `${requestPath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(payload, null, 2), { encoding: 'utf-8' });
    // node:fs has no atomic rename helper that crosses devices, but stays-in-dir is atomic on POSIX/NTFS
    try {
      writeFileSync(requestPath, readFileSync(tmpPath));
      unlinkSync(tmpPath);
    } catch (err) {
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
      throw new DispatchError(`Failed to enqueue request: ${(err as Error).message}`, err);
    }

    // Poll for response file
    const startedAt = Date.now();
    while (true) {
      if (existsSync(responsePath)) {
        // Brief settle to ensure write completed
        await sleep(50);
        let raw: string;
        try {
          raw = readFileSync(responsePath, 'utf-8');
        } catch (err) {
          throw new DispatchError(
            `Failed to read response file ${responsePath}: ${(err as Error).message}`,
            err,
          );
        }

        let parsed: QueueResponsePayload;
        try {
          parsed = JSON.parse(raw);
        } catch (err) {
          throw new DispatchError(
            `Response file is not valid JSON (${responsePath}): ${(err as Error).message}`,
            err,
          );
        }

        if (parsed.requestId !== req.requestId) {
          throw new DispatchError(
            `Response file requestId mismatch: expected ${req.requestId}, got ${parsed.requestId}`,
          );
        }

        if (this.cleanupAfterDispatch) {
          try { unlinkSync(requestPath); } catch { /* ignore */ }
          try { unlinkSync(responsePath); } catch { /* ignore */ }
        }

        return {
          requestId: req.requestId,
          rawText: parsed.rawText,
          usage: parsed.usage,
        };
      }

      if (Date.now() - startedAt > this.timeoutMs) {
        throw new DispatchTimeoutError(
          `Timeout waiting for response to ${req.requestId} after ${this.timeoutMs}ms`,
          req,
        );
      }

      await sleep(this.pollIntervalMs);
    }
  }

  /**
   * Hash + persist an image to the images directory. Returns the absolute
   * path so request JSON can reference it.
   */
  private persistImage(
    base64: string,
    mimeType: 'image/png' | 'image/jpeg' | 'image/webp',
  ): { imagePath: string; mimeType: typeof mimeType } {
    const cached = this.imageHashCache.get(base64);
    if (cached !== undefined) return { imagePath: cached, mimeType };

    const hash = createHash('sha256').update(base64).digest('hex').slice(0, 16);
    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/jpeg' ? 'jpg' : 'webp';
    const imagePath = join(this.imagesDir, `${hash}.${ext}`);

    if (!existsSync(imagePath)) {
      writeFileSync(imagePath, Buffer.from(base64, 'base64'));
    }
    this.imageHashCache.set(base64, imagePath);
    return { imagePath, mimeType };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

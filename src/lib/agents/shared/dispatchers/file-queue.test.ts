/**
 * FileQueueDispatcher tests — verify the request/response file protocol
 * works correctly. Drives both sides of the queue from within the same
 * test process by spawning a "worker" that polls for requests and writes
 * responses, mimicking what Claude Code does in production.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DispatchTimeoutError } from './types';
import { FileQueueDispatcher } from './file-queue';

let queueDir: string;

beforeEach(() => {
  queueDir = mkdtempSync(join(tmpdir(), 'file-queue-test-'));
});

afterEach(() => {
  rmSync(queueDir, { recursive: true, force: true });
});

/* ── Worker simulator ─────────────────────────────────────────────── */

/**
 * Polls the requests dir until it sees the given requestId, then writes a
 * canned response. Mimics what Claude Code does in production (read request,
 * dispatch via Task tool, write response).
 */
async function simulateWorker(
  args: {
    requestId: string;
    responseText: string;
    queueDir: string;
    delayMs?: number;
    pollMs?: number;
  },
): Promise<void> {
  const requestPath = join(args.queueDir, 'requests', `${args.requestId}.json`);
  const responsePath = join(args.queueDir, 'responses', `${args.requestId}.json`);
  const pollInterval = args.pollMs ?? 50;
  const delay = args.delayMs ?? 100;

  // Wait for request to appear
  const start = Date.now();
  while (!existsSync(requestPath)) {
    if (Date.now() - start > 5000) {
      throw new Error(`Worker timeout waiting for ${requestPath}`);
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  // Simulated dispatch latency
  await new Promise((r) => setTimeout(r, delay));

  // Write response
  writeFileSync(
    responsePath,
    JSON.stringify({
      requestId: args.requestId,
      rawText: args.responseText,
      usage: { inputTokens: 100, outputTokens: 50, cachedTokens: 0 },
    }),
  );
}

/* ── Tests ─────────────────────────────────────────────────────────── */

describe('FileQueueDispatcher', () => {
  it('writes a request file and unblocks when response arrives', async () => {
    const dispatcher = new FileQueueDispatcher({ queueDir, pollIntervalMs: 50 });
    const requestId = 'req-001';

    // Start a worker that fulfills the request after 100ms
    const workerPromise = simulateWorker({
      requestId,
      responseText: '{"agent_id":"00a","value":42}',
      queueDir,
    });

    const responsePromise = dispatcher.dispatch({
      requestId,
      agentId: '00a',
      tier: 'haiku',
      systemPrompt: 'sys',
      image: { kind: 'base64', data: 'IMG_DATA', mimeType: 'image/png' },
      userInstruction: 'instr',
      maxTokens: 200,
    });

    const [response] = await Promise.all([responsePromise, workerPromise]);
    expect(response.requestId).toBe(requestId);
    expect(response.rawText).toBe('{"agent_id":"00a","value":42}');
    expect(response.usage?.inputTokens).toBe(100);
  });

  it('persists image to images/ dir and references it by path in request JSON', async () => {
    const dispatcher = new FileQueueDispatcher({ queueDir, pollIntervalMs: 50 });
    const requestId = 'req-002';

    // Capture the request JSON before responding
    let capturedRequest: unknown = null;
    const workerPromise = (async () => {
      const requestPath = join(queueDir, 'requests', `${requestId}.json`);
      while (!existsSync(requestPath)) {
        await new Promise((r) => setTimeout(r, 25));
      }
      // Wait for write to settle
      await new Promise((r) => setTimeout(r, 50));
      capturedRequest = JSON.parse(readFileSync(requestPath, 'utf-8'));
      writeFileSync(
        join(queueDir, 'responses', `${requestId}.json`),
        JSON.stringify({ requestId, rawText: '{"agent_id":"00a","value":1}' }),
      );
    })();

    await Promise.all([
      dispatcher.dispatch({
        requestId,
        agentId: '00a',
        tier: 'haiku',
        systemPrompt: 'sys',
        image: { kind: 'base64', data: 'aGVsbG8=', mimeType: 'image/png' },
        userInstruction: 'instr',
        maxTokens: 200,
      }),
      workerPromise,
    ]);

    expect(capturedRequest).toMatchObject({
      requestId,
      agentId: '00a',
      tier: 'haiku',
      image: expect.objectContaining({
        mimeType: 'image/png',
        path: expect.stringContaining('images'),
      }),
    });

    // The image file should exist on disk
    const imagePath = (capturedRequest as { image: { path: string } }).image.path;
    expect(existsSync(imagePath)).toBe(true);
  });

  it('dedupes images by content (same image used twice → one file)', async () => {
    const dispatcher = new FileQueueDispatcher({ queueDir, pollIntervalMs: 50, cleanupAfterDispatch: false });
    const sameImage = 'aGVsbG8=';

    // Start two workers
    const w1 = simulateWorker({ requestId: 'r1', responseText: '{"agent_id":"00a","value":1}', queueDir });
    const w2 = simulateWorker({ requestId: 'r2', responseText: '{"agent_id":"00a","value":2}', queueDir });

    await Promise.all([
      dispatcher.dispatch({
        requestId: 'r1',
        agentId: '00a',
        tier: 'haiku',
        systemPrompt: 'sys',
        image: { kind: 'base64', data: sameImage, mimeType: 'image/png' },
        userInstruction: 'a',
        maxTokens: 100,
      }),
      dispatcher.dispatch({
        requestId: 'r2',
        agentId: '00a',
        tier: 'haiku',
        systemPrompt: 'sys',
        image: { kind: 'base64', data: sameImage, mimeType: 'image/png' },
        userInstruction: 'b',
        maxTokens: 100,
      }),
      w1,
      w2,
    ]);

    // Only one image file should exist
    const imagesDir = join(queueDir, 'images');
    const imageFiles = readdirSync(imagesDir);
    expect(imageFiles).toHaveLength(1);
  });

  it('throws DispatchTimeoutError when response never arrives', async () => {
    const dispatcher = new FileQueueDispatcher({
      queueDir,
      pollIntervalMs: 50,
      timeoutMs: 200,
    });

    await expect(
      dispatcher.dispatch({
        requestId: 'will-timeout',
        agentId: '00a',
        tier: 'haiku',
        systemPrompt: 'sys',
        image: { kind: 'base64', data: 'x', mimeType: 'image/png' },
        userInstruction: 'instr',
        maxTokens: 100,
      }),
    ).rejects.toThrow(DispatchTimeoutError);
  });

  it('cleans up request + response files after dispatch resolves', async () => {
    const dispatcher = new FileQueueDispatcher({ queueDir, pollIntervalMs: 50, cleanupAfterDispatch: true });
    const requestId = 'cleanup-test';

    const workerPromise = simulateWorker({
      requestId,
      responseText: '{"agent_id":"00a","value":1}',
      queueDir,
    });

    await Promise.all([
      dispatcher.dispatch({
        requestId,
        agentId: '00a',
        tier: 'haiku',
        systemPrompt: 'sys',
        image: { kind: 'base64', data: 'x', mimeType: 'image/png' },
        userInstruction: 'instr',
        maxTokens: 100,
      }),
      workerPromise,
    ]);

    expect(existsSync(join(queueDir, 'requests', `${requestId}.json`))).toBe(false);
    expect(existsSync(join(queueDir, 'responses', `${requestId}.json`))).toBe(false);
  });

  it('preserves files when cleanupAfterDispatch=false', async () => {
    const dispatcher = new FileQueueDispatcher({ queueDir, pollIntervalMs: 50, cleanupAfterDispatch: false });
    const requestId = 'preserve-test';

    const workerPromise = simulateWorker({
      requestId,
      responseText: '{"agent_id":"00a","value":1}',
      queueDir,
    });

    await Promise.all([
      dispatcher.dispatch({
        requestId,
        agentId: '00a',
        tier: 'haiku',
        systemPrompt: 'sys',
        image: { kind: 'base64', data: 'x', mimeType: 'image/png' },
        userInstruction: 'instr',
        maxTokens: 100,
      }),
      workerPromise,
    ]);

    expect(existsSync(join(queueDir, 'requests', `${requestId}.json`))).toBe(true);
    expect(existsSync(join(queueDir, 'responses', `${requestId}.json`))).toBe(true);
  });

  it('rejects mismatched requestId in response', async () => {
    const dispatcher = new FileQueueDispatcher({ queueDir, pollIntervalMs: 50 });
    const requestId = 'mismatch-test';

    // Worker writes a response with the WRONG requestId
    const workerPromise = (async () => {
      const requestPath = join(queueDir, 'requests', `${requestId}.json`);
      while (!existsSync(requestPath)) {
        await new Promise((r) => setTimeout(r, 25));
      }
      await new Promise((r) => setTimeout(r, 50));
      writeFileSync(
        join(queueDir, 'responses', `${requestId}.json`),
        JSON.stringify({ requestId: 'wrong-id', rawText: '{}' }),
      );
    })();

    await expect(
      Promise.all([
        dispatcher.dispatch({
          requestId,
          agentId: '00a',
          tier: 'haiku',
          systemPrompt: 'sys',
          image: { kind: 'base64', data: 'x', mimeType: 'image/png' },
          userInstruction: 'instr',
          maxTokens: 100,
        }),
        workerPromise,
      ]),
    ).rejects.toThrow(/requestId mismatch/);
  });
});

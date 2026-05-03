import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetDispatcherCache,
  FileQueueDispatcher,
  getDefaultDispatcher,
  MockDispatcher,
  SdkDispatcher,
} from './index';

beforeEach(() => {
  _resetDispatcherCache();
});

afterEach(() => {
  _resetDispatcherCache();
  vi.unstubAllEnvs();
});

describe('getDefaultDispatcher env-based selection', () => {
  it('defaults to SdkDispatcher when AGENT_DISPATCHER unset', () => {
    vi.stubEnv('AGENT_DISPATCHER', '');
    const d = getDefaultDispatcher();
    expect(d).toBeInstanceOf(SdkDispatcher);
  });

  it('returns SdkDispatcher for AGENT_DISPATCHER=sdk', () => {
    vi.stubEnv('AGENT_DISPATCHER', 'sdk');
    const d = getDefaultDispatcher();
    expect(d).toBeInstanceOf(SdkDispatcher);
  });

  it('returns FileQueueDispatcher for AGENT_DISPATCHER=file-queue', () => {
    vi.stubEnv('AGENT_DISPATCHER', 'file-queue');
    vi.stubEnv('AGENT_QUEUE_DIR', './.test-queue');
    const d = getDefaultDispatcher();
    expect(d).toBeInstanceOf(FileQueueDispatcher);
  });

  it('returns MockDispatcher for AGENT_DISPATCHER=mock', () => {
    vi.stubEnv('AGENT_DISPATCHER', 'mock');
    const d = getDefaultDispatcher();
    expect(d).toBeInstanceOf(MockDispatcher);
  });

  it('throws on unknown mode', () => {
    vi.stubEnv('AGENT_DISPATCHER', 'unknown');
    expect(() => getDefaultDispatcher()).toThrow(/Unknown AGENT_DISPATCHER/);
  });

  it('caches the dispatcher per-mode', () => {
    vi.stubEnv('AGENT_DISPATCHER', 'mock');
    const a = getDefaultDispatcher();
    const b = getDefaultDispatcher();
    expect(a).toBe(b);
  });

  it('rebuilds dispatcher when mode changes', () => {
    vi.stubEnv('AGENT_DISPATCHER', 'mock');
    const a = getDefaultDispatcher();

    vi.stubEnv('AGENT_DISPATCHER', 'sdk');
    const b = getDefaultDispatcher();

    expect(a).not.toBe(b);
    expect(a).toBeInstanceOf(MockDispatcher);
    expect(b).toBeInstanceOf(SdkDispatcher);
  });
});

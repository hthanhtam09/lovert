import { beforeEach, describe, expect, it, vi } from 'vitest';

const cancelJobs = vi.fn();
vi.mock('./runner', () => ({ cancelJobs }));

describe('runner-client cancel (regression: late async cancel discarded the next job on WebKit)', () => {
  beforeEach(() => {
    vi.resetModules();
    cancelJobs.mockClear();
  });

  it('before the runner has loaded there is nothing to cancel, and nothing is scheduled for later', async () => {
    const { cancelRunnerJobs, loadRunner } = await import('./runner-client');
    cancelRunnerJobs(); // invalidate() on file pick, first visit
    await loadRunner(); // the new job's own load
    expect(cancelJobs).not.toHaveBeenCalled(); // the old form would cancel here, after the new job could be sent
  });

  it('after the runner has loaded, cancel runs synchronously (before any job sent afterwards)', async () => {
    const { cancelRunnerJobs, loadRunner } = await import('./runner-client');
    await loadRunner();
    cancelRunnerJobs();
    expect(cancelJobs).toHaveBeenCalledTimes(1);
  });
});

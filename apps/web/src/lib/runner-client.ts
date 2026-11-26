'use client';
/**
 * Loads the runner (and its Worker) on demand, in the browser only, so the SSR graph never sees `new Worker`.
 *
 * Cancelling is synchronous on purpose. A job can only be pending once the runner module has loaded, so when it has
 * not loaded yet there is nothing to cancel. The earlier form `loadRunner().then((m) => m.cancelJobs())` ran the cancel
 * later, after the module finished loading; if a new job was sent in between, that late cancel discarded the *new* job
 * (seen on WebKit: job-sent and job-discarded in the same millisecond, no result, no error, no download).
 */
type Runner = typeof import('./runner');
let loaded: Runner | null = null;

export function loadRunner(): Promise<Runner> {
  return import('./runner').then((m) => (loaded = m));
}

/** Discard the running job now (if any) and ask the worker to stop it. Never affects a job sent after this call. */
export function cancelRunnerJobs(): void {
  loaded?.cancelJobs();
}

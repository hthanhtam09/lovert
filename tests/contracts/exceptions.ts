/**
 * The only results the tool gate tolerates besides PASS and verified UNSUPPORTED.
 * Each entry names one slug, case, project and status with a concrete reason and an owner action.
 * Keep it empty unless a failure is understood, tracked and accepted for this release.
 */
export interface GateException {
  slug: string;
  case: string;
  project: string;
  status: 'skipped' | 'failed' | 'flaky';
  reason: string;
}

export const EXCEPTIONS: readonly GateException[] = [];

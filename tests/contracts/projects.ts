/**
 * Playwright projects every required E2E case must pass on (merge gate and release gate).
 * Emulated devices are not real phones: "mobile-chromium" = Pixel 7 viewport on Chromium,
 * "mobile-webkit" = iPhone 13 viewport on Playwright WebKit (not iOS Safari).
 */
export const REQUIRED_PROJECTS = ['chromium', 'firefox', 'webkit', 'mobile-chromium', 'mobile-webkit'] as const;
export type ProjectName = (typeof REQUIRED_PROJECTS)[number];

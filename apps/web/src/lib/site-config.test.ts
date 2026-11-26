import { describe, expect, it } from 'vitest';
import { resolveSiteConfig } from './site-config';

describe('resolveSiteConfig', () => {
  it('local/preview builds need no origin and emit none', () => {
    expect(resolveSiteConfig({})).toEqual({ isProduction: false, origin: null });
    expect(resolveSiteConfig({ SITE_URL: 'http://localhost:3000' })).toEqual({ isProduction: false, origin: null });
  });
  it('production requires a valid https non-localhost origin', () => {
    expect(() => resolveSiteConfig({ DEPLOY_ENV: 'production' })).toThrow(/requires SITE_URL/);
    expect(() => resolveSiteConfig({ DEPLOY_ENV: 'production', SITE_URL: 'https://localhost' })).toThrow(/localhost/);
    expect(() => resolveSiteConfig({ DEPLOY_ENV: 'production', SITE_URL: 'http://a.com' })).toThrow(/https/);
    expect(() => resolveSiteConfig({ DEPLOY_ENV: 'production', SITE_URL: 'https://a.com/x' })).toThrow(/origin only/);
    expect(() => resolveSiteConfig({ DEPLOY_ENV: 'production', SITE_URL: 'nope' })).toThrow(/valid URL/);
    expect(() => resolveSiteConfig({ DEPLOY_ENV: 'production', SITE_URL: 'https://lovert.example' })).toThrow(/reserved test domain/);
    expect(resolveSiteConfig({ DEPLOY_ENV: 'production', SITE_URL: 'https://lovert.example', LOVERT_QA_BUILD: '1' }).origin).toBe('https://lovert.example');
    expect(resolveSiteConfig({ DEPLOY_ENV: 'production', SITE_URL: 'https://Example.com/' })).toEqual({ isProduction: true, origin: 'https://example.com' });
  });
});

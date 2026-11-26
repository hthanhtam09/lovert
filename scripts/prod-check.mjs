// QA-only production build with a reserved test origin. The result is moved out of
// apps/web/out to apps/web/out-prodcheck so it can never be the deploy artifact.
import { execSync } from 'node:child_process';
import { renameSync, rmSync } from 'node:fs';

const env = { ...process.env, DEPLOY_ENV: 'production', SITE_URL: 'https://lovert.example', LOVERT_QA_BUILD: '1' };
const run = (cmd) => execSync(cmd, { stdio: 'inherit', env });
rmSync('apps/web/out-prodcheck', { recursive: true, force: true });
try {
  run('pnpm build');
  run('node scripts/check-build.mjs apps/web/out');
} finally {
  renameSync('apps/web/out', 'apps/web/out-prodcheck');
  console.log('QA production build moved to apps/web/out-prodcheck (not deployable). Run `pnpm build` again for a preview artifact.');
}

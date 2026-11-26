import type { Check } from '@lovert/core';
import s from './tool.module.css';

export function Checks({ checks }: { checks: Check[] }) {
  return (
    <ul className={s.checks} aria-label="Output checks">
      {checks.map((c) => (
        <li key={c.id} className={c.pass ? s.pass : s.fail}>
          <span aria-hidden="true">{c.pass ? '✓' : '✗'}</span> <span className="sr-only">{c.pass ? 'Passed:' : 'Failed:'}</span> {c.label}
        </li>
      ))}
    </ul>
  );
}

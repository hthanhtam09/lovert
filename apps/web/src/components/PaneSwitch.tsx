import s from './tool.module.css';

export type Pane = 'preview' | 'settings';

/** Mobile-only switch between the two workspace panes. On wide screens both panes are always shown. */
export function PaneSwitch({ pane, onChange, previewLabel, settingsLabel, previewId, settingsId }: {
  pane: Pane;
  onChange: (p: Pane) => void;
  previewLabel: string;
  settingsLabel: string;
  previewId: string;
  settingsId: string;
}) {
  return (
    <div className={s.paneSwitch} role="group" aria-label="Workspace view">
      <button type="button" aria-pressed={pane === 'preview'} aria-controls={previewId} onClick={() => onChange('preview')}>
        {previewLabel}
      </button>
      <button type="button" aria-pressed={pane === 'settings'} aria-controls={settingsId} onClick={() => onChange('settings')}>
        {settingsLabel}
      </button>
    </div>
  );
}

/** Mobile-only bottom bar shown on the preview pane: one step forward to the settings/result pane. */
export function MobileBar({ pane, label, disabled, onClick }: { pane: Pane; label: string; disabled?: boolean; onClick: () => void }) {
  if (pane !== 'preview') return null;
  return (
    <div className={s.mobileBar}>
      <button type="button" className={s.mobileBarButton} disabled={disabled} onClick={onClick}>
        {label}
      </button>
    </div>
  );
}

/** Move focus to the size limit field (or its switch when the limit is off) so the user can change settings after a result. */
export function focusSettings(prefix: string) {
  const field = document.getElementById(`${prefix}-limit`) as HTMLInputElement | null;
  const target = field && !field.disabled ? field : document.getElementById(`${prefix}-limit-on`);
  target?.scrollIntoView({ block: 'center' });
  target?.focus();
}

'use client';
import { toBytes, type SizeUnit } from '@lovert/core';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import s from './tool.module.css';

export interface LimitState {
  enabled: boolean;
  value: string;
  unit: SizeUnit;
}

export function limitToBytes(l: LimitState): number | undefined | 'invalid' {
  if (!l.enabled) return undefined;
  try {
    // Parse the typed decimal text exactly: "1.005" KB = 1,005 bytes (no binary float error).
    return toBytes(l.value, l.unit);
  } catch {
    return 'invalid';
  }
}

export function LimitInput({ value, onChange, idPrefix }: { value: LimitState; onChange: (l: LimitState) => void; idPrefix: string }) {
  return (
    <fieldset className={s.fieldset}>
      <legend>Size limit</legend>
      <div className={s.inline}>
        <Checkbox
          id={`${idPrefix}-limit-on`}
          checked={value.enabled}
          onCheckedChange={(c) => onChange({ ...value, enabled: c === true })}
        />
        <Label htmlFor={`${idPrefix}-limit-on`}>Keep the file at or under a limit</Label>
      </div>
      {value.enabled && (
        <div className={s.row}>
          <Label htmlFor={`${idPrefix}-limit`} className="sr-only">
            Maximum size
          </Label>
          <Input
            id={`${idPrefix}-limit`}
            inputMode="decimal"
            className="h-11 w-28"
            value={value.value}
            onChange={(e) => onChange({ ...value, value: e.target.value })}
          />
          <Label htmlFor={`${idPrefix}-unit`} className="sr-only">
            Unit
          </Label>
          <NativeSelect id={`${idPrefix}-unit`} className="h-11" value={value.unit} onChange={(e) => onChange({ ...value, unit: e.target.value as SizeUnit })}>
            <NativeSelectOption value="KB">KB</NativeSelectOption>
            <NativeSelectOption value="MB">MB</NativeSelectOption>
          </NativeSelect>
        </div>
      )}
      <p className={s.hint}>1 KB = 1,000 bytes and 1 MB = 1,000,000 bytes. The check uses the exact byte count.</p>
    </fieldset>
  );
}

'use client';
import { useId, useRef, useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import s from './tool.module.css';

export function FilePicker(props: { accept: string; multiple?: boolean; label: string; hint: string; compact?: boolean; title?: string; mark?: string; onFiles: (files: File[]) => void }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={props.compact ? s.inline : `${s.drop} ${s.empty} ${over ? s.dropOver : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) props.onFiles(props.multiple ? files : files.slice(0, 1));
      }}
    >
      {!props.compact && props.mark && <span className={s.emptyMark} aria-hidden="true">{props.mark}</span>}
      {!props.compact && props.title && <p className={s.emptyTitle}>{props.title}</p>}
      <label htmlFor={id} className={cn(buttonVariants({ size: props.compact ? 'sm' : 'lg', variant: props.compact ? 'outline' : 'default' }), props.compact ? 'h-11 cursor-pointer px-3' : 'h-11 cursor-pointer px-5 text-base font-semibold')}>
        {props.label}
      </label>
      <input
        ref={input}
        id={id}
        type="file"
        className={s.fileInput}
        accept={props.accept}
        multiple={props.multiple}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) props.onFiles(files);
          e.target.value = ''; // allow picking the same file again
        }}
      />
      {!props.compact && <p className={s.hint}>{props.hint}</p>}
    </div>
  );
}

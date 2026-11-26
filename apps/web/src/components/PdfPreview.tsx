'use client';
import { useEffect, useRef, useState } from 'react';
import s from './tool.module.css';

/** Renders pages of the exported PDF bytes (the same bytes the user downloads). */
export function PdfPreview({ bytes }: { bytes: Uint8Array }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'done' | 'error'>('loading');
  const [pages, setPages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const el = host.current;
    let destroy: (() => void) | undefined;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
        // PDF.js may detach the buffer it gets, so give it a short-lived copy.
        const task = pdfjs.getDocument({ data: bytes.slice() });
        destroy = () => void task.destroy();
        const doc = await task.promise;
        if (cancelled || !el) return;
        el.replaceChildren();
        // Fingerprint of the exact bytes rendered here, so tests can prove preview == download.
        try {
          const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice()));
          el.dataset.sha256 = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
        } catch {
          /* no SubtleCrypto (insecure context): fingerprint unavailable */
        }
        setPages(doc.numPages);
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = (220 * (window.devicePixelRatio || 1)) / base.width;
          const vp = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(vp.width);
          canvas.height = Math.ceil(vp.height);
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('aria-label', `Page ${i} of ${doc.numPages}`);
          canvas.dataset.page = String(i);
          const fig = document.createElement('figure');
          const cap = document.createElement('figcaption');
          cap.textContent = `Page ${i}`;
          fig.append(canvas, cap);
          el.append(fig);
          await page.render({ canvas, viewport: vp }).promise;
        }
        if (!cancelled) setState('done');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [bytes]);

  return (
    <div>
      <p className={s.hint} aria-live="polite">
        {state === 'loading' && 'Rendering preview of the exported PDF…'}
        {state === 'done' && `Preview of the exported PDF: ${pages} page${pages === 1 ? '' : 's'}.`}
        {state === 'error' && 'The preview could not be rendered in this browser. The PDF itself was created and checked.'}
      </p>
      <div ref={host} className={s.pages} data-testid="pdf-pages" />
    </div>
  );
}

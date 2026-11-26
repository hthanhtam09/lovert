import { ImageResponse } from 'next/og';

export const dynamic = 'force-static';
export const alt = 'Lovert: files that fit the size limit, checked before you download';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 80, background: '#2b1914', color: '#ffffff' }}>
        <div style={{ display: 'flex', fontSize: 96, fontWeight: 800, letterSpacing: -3 }}>
          Lo<span style={{ color: '#ff9165' }}>vert</span>
        </div>
        <div style={{ fontSize: 44, marginTop: 24, maxWidth: 960 }}>Files that fit the size limit. Checked before you download.</div>
        <div style={{ display: 'flex', marginTop: 40, fontSize: 32, color: '#ffc19f' }}>Measured: 49,812 bytes, limit 50,000 bytes</div>
      </div>
    ),
    size,
  );
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { solidPng } from '../../../../../tests/fixtures/png';

// Fake canvas adapter: lets us control exactly which bytes the "browser encoder" returns.
const encoded: { bytes: Uint8Array } = { bytes: new Uint8Array() };
vi.mock('./surface', () => ({
  decode: vi.fn(async () => ({ img: {}, width: 4, height: 4, close() {} })),
  hasAlpha: vi.fn(() => false),
  render: vi.fn(() => ({ ctx: {}, encode: async () => encoded.bytes })),
}));

const { compressImage } = await import('./compress');
const input = solidPng(4, 4, [10, 20, 30]);
const fakeWebp = () => {
  const b = new Uint8Array(64);
  b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  return b;
};

describe('compressImage output format verification', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports FORMAT_MISMATCH when the encoder returns PNG for a WebP request', async () => {
    encoded.bytes = solidPng(4, 4, [1, 1, 1]);
    const { result } = await compressImage(input, { format: 'webp', allowResize: false, background: '#fff' });
    expect(result).toMatchObject({ status: 'error', code: 'FORMAT_MISMATCH' });
  });

  it('accepts real WebP bytes and labels the output as WebP', async () => {
    encoded.bytes = fakeWebp();
    const { result } = await compressImage(input, { format: 'webp', allowResize: false, background: '#fff', limitBytes: 64 });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.output.format).toBe('webp');
      expect(result.output.bytes).toBe(encoded.bytes); // the same buffer that preview and download use
      expect(result.output.checks.every((c) => c.pass)).toBe(true);
    }
  });
});

export const ErrorCodes = {
  EMPTY_FILE: 'EMPTY_FILE',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  TOO_MANY_PIXELS: 'TOO_MANY_PIXELS',
  TOO_MANY_FILES: 'TOO_MANY_FILES',
  DECODE_FAILED: 'DECODE_FAILED',
  ENCODE_FAILED: 'ENCODE_FAILED',
  INVALID_OPTIONS: 'INVALID_OPTIONS',
  BROWSER_UNSUPPORTED: 'BROWSER_UNSUPPORTED',
  CANCELLED: 'CANCELLED',
  FORMAT_MISMATCH: 'FORMAT_MISMATCH',
  INVALID_ENCODING: 'INVALID_ENCODING',
  INVALID_CSV: 'INVALID_CSV',
  INVALID_JSON: 'INVALID_JSON',
  TOO_MANY_ROWS: 'TOO_MANY_ROWS',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class LovertError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'LovertError';
  }
}

export function toErrorCode(err: unknown): ErrorCode {
  if (err instanceof LovertError) return err.code;
  if (typeof err === 'object' && err && 'code' in err) {
    const c = (err as { code: unknown }).code;
    if (typeof c === 'string' && c in ErrorCodes) return c as ErrorCode;
  }
  return ErrorCodes.ENCODE_FAILED;
}

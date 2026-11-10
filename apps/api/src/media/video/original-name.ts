import path from 'node:path';

const MAX_NAME_LENGTH = 255;

/** Browsers send a bare name, but never trust it: no paths, no control chars. */
export function sanitizeOriginalName(name: string | undefined): string {
  const base = path.basename((name ?? '').replace(/\\/g, '/'));
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return Array.from(cleaned || 'video')
    .slice(0, MAX_NAME_LENGTH)
    .join('');
}

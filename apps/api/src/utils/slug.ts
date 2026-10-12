import { randomBytes } from 'crypto';

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'org';
}

export function uniqueSlugCandidate(base: string, attempt: number): string {
  if (attempt === 0) {
    return base;
  }
  return `${base}-${randomBytes(2).toString('hex')}`;
}

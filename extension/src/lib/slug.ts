// Shared slug generation for annotations and collections:
// kebab-cased title (max 40 chars) + short random suffix for uniqueness.
export function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${base}-${rand}`;
}

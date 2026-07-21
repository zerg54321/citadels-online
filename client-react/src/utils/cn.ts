// Minimal classnames helper (no external dep). Mirrors Vue's `:class` object
// syntax so migrated components keep their conditional-class logic compact.
export type ClassPart = string | false | null | undefined | Record<string, boolean>;

export function cn(...parts: ClassPart[]): string {
  return parts.flatMap((p) => {
    if (!p) return [] as string[];
    if (typeof p === 'string') return [p];
    return Object.entries(p).filter(([, v]) => v).map(([k]) => k);
  }).join(' ');
}

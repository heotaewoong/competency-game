export function normalizeGlyphMnemonic(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const glyphs = Array.from(value.trim());
  return glyphs.length === 1 ? glyphs[0] : fallback;
}

export function normalizeGlyphMnemonics(value: unknown, defaults: readonly string[]) {
  if (!Array.isArray(value) || value.length !== defaults.length) return [...defaults];
  return defaults.map((fallback, index) => normalizeGlyphMnemonic(value[index], fallback));
}

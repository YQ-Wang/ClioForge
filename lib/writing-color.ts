/** Normalize browser-serialized colors as well as palette values. */
export function writingColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (/^#[a-f\d]{6}$/i.test(value)) return value.toLowerCase();
  if (/^#[a-f\d]{3}$/i.test(value))
    return (
      '#' +
      value
        .slice(1)
        .split('')
        .map((c) => c + c)
        .join('')
        .toLowerCase()
    );
  const rgb = value.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (!rgb || rgb.slice(1).some((c) => Number(c) > 255)) return null;
  return (
    '#' +
    rgb
      .slice(1)
      .map((c) => Number(c).toString(16).padStart(2, '0'))
      .join('')
  );
}

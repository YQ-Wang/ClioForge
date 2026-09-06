export function selectedPages(
  value: string,
  available: number[],
  limit = 10,
): number[] {
  const pages = new Set<number>();
  for (const part of value.split(/[,，]/)) {
    const match = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(part);
    if (!match) throw new Error('页码格式无效，例如 1-3, 8。');
    const start = Number(match[1]),
      end = Number(match[2] || match[1]);
    if (start < 1 || end < start || end - start >= limit)
      throw new Error('请每次选择不超过 10 个有效页码。');
    for (let page = start; page <= end; page++) {
      if (!available.includes(page))
        throw new Error('所选页码不在这份材料中。');
      pages.add(page);
      if (pages.size > limit)
        throw new Error('请每次选择不超过 10 个有效页码。');
    }
  }
  return [...pages].sort((a, b) => a - b);
}

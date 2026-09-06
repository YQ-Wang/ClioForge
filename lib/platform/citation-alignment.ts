// Only normalize PDF layout whitespace. Preserve letters, punctuation and hyphens.
// Every accepted quotation is replaced by an exact span of the immutable page.
function layout(text: string) {
  let value = '';
  const positions: number[] = [];
  for (let i = 0; i < text.length;) {
    if (/\s/.test(text[i])) {
      const start = i;
      while (i < text.length && /\s/.test(text[i])) i++;
      const wrappedHyphen =
        text[start - 1] === '-' &&
        /[\r\n]/.test(text.slice(start, i)) &&
        /\p{L}/u.test(text[i] || '');
      if (!wrappedHyphen && value && i < text.length) {
        value += ' ';
        positions.push(start);
      }
    } else {
      value += text[i];
      positions.push(i++);
    }
  }
  return { value, positions };
}
export function alignCitation(page: string, quote: string) {
  const source = layout(page),
    target = layout(quote).value;
  if (!target) return null;
  const match = source.value.indexOf(target);
  if (match < 0 || source.value.indexOf(target, match + 1) !== -1) return null;
  const start = source.positions[match],
    end = source.positions[match + target.length - 1] + 1;
  return { start, quote: page.slice(start, end) };
}

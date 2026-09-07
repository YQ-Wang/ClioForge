// Approximate retrieval expands spellings, never historical identities.
export function spellingPrefixes(terms: string[]) {
  return [
    ...new Set(
      terms.flatMap((term) => {
        if (!/^[a-z]+(?: [a-z]+)*$/.test(term)) return [];
        const words = term.split(' '),
          last = words.at(-1)!;
        if (last.length < 3) return [];
        words[words.length - 1] =
          last.length >= 5 && last.endsWith('s') ? last.slice(0, -1) : last;
        return [words.join(' ')];
      }),
    ),
  ];
}

export function sourceMatchSnippet(text: string, terms: string[]) {
  let normalized = '';
  const starts: number[] = [],
    ends: number[] = [];
  let offset = 0;
  for (const character of text) {
    const end = offset + character.length;
    for (const letter of character
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()) {
      if (/\s/u.test(letter)) {
        if (normalized && !normalized.endsWith(' ')) {
          normalized += ' ';
          starts.push(offset);
          ends.push(end);
        }
      } else {
        normalized += letter;
        for (let unit = 0; unit < letter.length; unit++) {
          starts.push(offset);
          ends.push(end);
        }
      }
    }
    offset = end;
  }
  // The user's wording precedes expanded aliases: show it when present.
  const match = terms
    .map((term) => ({ term, at: normalized.indexOf(term) }))
    .find((match) => match.at >= 0);
  if (!match) return text.slice(0, 320);
  const at = starts[match.at];
  const end = ends[match.at + match.term.length - 1];
  return text.slice(Math.max(0, at - 70), Math.max(end, at + 250));
}

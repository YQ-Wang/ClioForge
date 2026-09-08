'use client';
import { Fragment } from 'react';

type CitationLink = (
  number: number,
) => { label: string; onOpen: () => void } | undefined;

function inline(text: string, citationLink?: CitationLink) {
  return text
    .split(/(\*\*[^*]+\*\*|\[[^\]]+\]\((?:https?:\/\/|\/\?)[^)]+\)|\[\d+\])/g)
    .map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**'))
        return (
          <strong key={index}>{inline(part.slice(2, -2), citationLink)}</strong>
        );
      const citation = part.match(/^\[(\d+)\]$/);
      const target = citation ? citationLink?.(Number(citation[1])) : undefined;
      if (target)
        return (
          <button
            key={index}
            type="button"
            className="report-inline-citation"
            aria-label={target.label}
            title={target.label}
            onClick={target.onOpen}
          >
            {part}
          </button>
        );
      const link = part.match(/^\[([^\]]+)\]\(((?:https?:\/\/|\/\?)[^)]+)\)$/);
      if (link)
        return (
          <a
            key={index}
            href={link[2]}
            rel="noreferrer"
            target={link[2].startsWith('http') ? '_blank' : undefined}
          >
            {link[1]}
          </a>
        );
      return <Fragment key={index}>{part}</Fragment>;
    });
}

// Render a small, safe writing vocabulary. Source text is never interpreted as HTML.
export default function ResearchText({
  text,
  citationLink,
}: {
  text: string;
  citationLink?: CitationLink;
}) {
  return (
    <div className="research-prose">
      {text
        .split(/\n\s*\n/)
        .filter(Boolean)
        .map((block, index) => {
          if (/^#{1,4}\s/.test(block))
            return (
              <h3 key={index}>
                {inline(block.replace(/^#{1,4}\s+/, ''), citationLink)}
              </h3>
            );
          if (block.split('\n').every((line) => /^>\s?/.test(line)))
            return (
              <blockquote key={index}>
                {inline(block.replace(/^>\s?/gm, ''), citationLink)}
              </blockquote>
            );
          if (block.split('\n').every((line) => /^[-*]\s/.test(line)))
            return (
              <ul key={index}>
                {block.split('\n').map((line, n) => (
                  <li key={n}>{inline(line.slice(2), citationLink)}</li>
                ))}
              </ul>
            );
          if (block.split('\n').every((line) => /^\d+\.\s/.test(line)))
            return (
              <ol key={index}>
                {block.split('\n').map((line, n) => (
                  <li key={n} value={Number(line.match(/^\d+/)![0])}>
                    {inline(line.replace(/^\d+\.\s+/, ''), citationLink)}
                  </li>
                ))}
              </ol>
            );
          return <p key={index}>{inline(block, citationLink)}</p>;
        })}
    </div>
  );
}

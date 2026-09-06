'use client';
import { Fragment } from 'react';

function inline(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*|\[[^\]]+\]\((?:https?:\/\/|\/\?)[^)]+\))/g)
    .map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**'))
        return <strong key={index}>{part.slice(2, -2)}</strong>;
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
export default function ResearchText({ text }: { text: string }) {
  return (
    <div className="research-prose">
      {text
        .split(/\n\s*\n/)
        .filter(Boolean)
        .map((block, index) => {
          if (/^#{1,4}\s/.test(block))
            return (
              <h3 key={index}>{inline(block.replace(/^#{1,4}\s+/, ''))}</h3>
            );
          if (block.split('\n').every((line) => /^>\s?/.test(line)))
            return (
              <blockquote key={index}>
                {inline(block.replace(/^>\s?/gm, ''))}
              </blockquote>
            );
          if (block.split('\n').every((line) => /^[-*]\s/.test(line)))
            return (
              <ul key={index}>
                {block.split('\n').map((line, n) => (
                  <li key={n}>{inline(line.slice(2))}</li>
                ))}
              </ul>
            );
          return <p key={index}>{inline(block)}</p>;
        })}
    </div>
  );
}

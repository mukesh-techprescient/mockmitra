import katex from 'katex';
import 'katex/dist/katex.min.css';
import { memo } from 'react';

// Renders text containing $inline$ / $$display$$ LaTeX and **bold**. Line breaks are preserved.
const MATH = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
const BOLD = /\*\*(.+?)\*\*/g;

function Rich({ text, as: Tag = 'div', className = '' }) {
  if (!text) return null;
  const parts = text.split(MATH);
  return (
    <Tag className={`rich ${className}`}>
      {parts.map((p, i) => {
        if (i % 2 === 0) return p.split(BOLD).map((t, j) => (j % 2 ? <strong key={`${i}-${j}`}>{t}</strong> : t));
        const display = p.startsWith('$$');
        const tex = display ? p.slice(2, -2) : p.slice(1, -1);
        const html = katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore' });
        return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </Tag>
  );
}

export default memo(Rich);

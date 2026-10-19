import { Fragment, memo, type ReactNode } from 'react';

// Small, dependency-free markdown renderer covering what agents produce:
// paragraphs, headings, lists, code blocks, blockquotes, GFM tables, bold,
// italics, inline code and links. It builds React elements (never HTML
// strings), so model output cannot inject markup.
// If the app already has a markdown renderer, pass it to the provider via
// `renderMarkdown` instead.

const SAFE_URL = /^(https?:\/\/|mailto:|\/(?!\/)|#)/i;

const renderInline = (text: string, keyPrefix: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s<)]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-${index++}`;

    if (token.startsWith('`')) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(<strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>);
    } else if (token.startsWith('*')) {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>);
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      const [, label = token, href = ''] = linkMatch ?? [];

      nodes.push(
        SAFE_URL.test(href) ? (
          <a key={key} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer noopener">
            {renderInline(label, key)}
          </a>
        ) : (
          label
        ),
      );
    } else {
      nodes.push(
        <a key={key} href={token} target="_blank" rel="noreferrer noopener">
          {token}
        </a>,
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
};

const isTableSeparator = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());

const renderBlocks = (markdown: string): ReactNode[] => {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;

  const key = () => `block-${blocks.length}`;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*```(\w*)/);

    if (fence) {
      const code: string[] = [];

      index += 1;

      while (index < lines.length && !/^\s*```/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }

      index += 1;
      blocks.push(
        <pre key={key()}>
          <code data-language={fence[1] || undefined}>{code.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);

    if (heading) {
      const level = heading[1].length;
      const content = renderInline(heading[2], key());
      const k = key();

      blocks.push(
        level === 1 ? <h1 key={k}>{content}</h1> : level === 2 ? <h2 key={k}>{content}</h2> : level === 3 ? <h3 key={k}>{content}</h3> : <h4 key={k}>{content}</h4>,
      );
      index += 1;
      continue;
    }

    if (line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const header = splitRow(line);
      const rows: string[][] = [];

      index += 2;

      while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') {
        rows.push(splitRow(lines[index]));
        index += 1;
      }

      const k = key();

      blocks.push(
        <div className="agent-table-wrap" key={k}>
          <table>
            <thead>
              <tr>
                {header.map((cell, cellIndex) => (
                  <th key={cellIndex}>{renderInline(cell, `${k}-h${cellIndex}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {header.map((_, cellIndex) => (
                    <td key={cellIndex}>{renderInline(row[cellIndex] ?? '', `${k}-${rowIndex}-${cellIndex}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote: string[] = [];

      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }

      blocks.push(<blockquote key={key()}>{renderBlocks(quote.join('\n'))}</blockquote>);
      continue;
    }

    const listMatch = line.match(/^\s*([-*+]|\d+[.)])\s+/);

    if (listMatch) {
      const isOrdered = /\d/.test(listMatch[1]);
      const items: string[] = [];

      while (index < lines.length) {
        const itemMatch = lines[index].match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);

        if (itemMatch && /\d/.test(itemMatch[1]) === isOrdered) {
          items.push(itemMatch[2]);
          index += 1;
        } else if (lines[index].trim() !== '' && /^\s{2,}/.test(lines[index]) && items.length > 0) {
          items[items.length - 1] += ` ${lines[index].trim()}`;
          index += 1;
        } else {
          break;
        }
      }

      const k = key();
      const children = items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, `${k}-${itemIndex}`)}</li>);

      blocks.push(isOrdered ? <ol key={k}>{children}</ol> : <ul key={k}>{children}</ul>);
      continue;
    }

    const paragraph: string[] = [];

    while (
      index < lines.length &&
      lines[index].trim() !== '' &&
      !/^\s*(```|#{1,4}\s|>|[-*+]\s|\d+[.)]\s)/.test(lines[index]) &&
      !(lines[index].includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1]))
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }

    const k = key();

    blocks.push(
      <p key={k}>
        {paragraph.map((paragraphLine, lineIndex) => (
          <Fragment key={lineIndex}>
            {lineIndex > 0 && <br />}
            {renderInline(paragraphLine, `${k}-${lineIndex}`)}
          </Fragment>
        ))}
      </p>,
    );
  }

  return blocks;
};

export const Markdown = memo(({ text }: { text: string }) => (
  <div className="agent-markdown">{renderBlocks(text)}</div>
));

Markdown.displayName = 'Markdown';

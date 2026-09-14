import React from 'react';

/**
 * A small Markdown renderer covering what the curriculum uses:
 * headings, paragraphs, lists, fenced code, tables, links, bold/italic/code,
 * and callouts written as blockquotes starting with [!PARLOA], [!GENERAL],
 * [!SIM], [!TIP] or [!WARNING].
 */

const CALLOUT_TITLES: Record<string, { cls: string; title: string }> = {
  PARLOA: { cls: 'parloa', title: 'Documented Parloa behaviour' },
  GENERAL: { cls: 'general', title: 'General integration concept' },
  SIM: { cls: 'sim', title: "This trainer's simulation" },
  TIP: { cls: 'tip', title: 'Tip' },
  WARNING: { cls: 'warning', title: 'Watch out' },
  MULE: { cls: 'general', title: 'MuleSoft / DataWeave parallel' },
};

export function renderInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith('`')) out.push(<code key={key++}>{token.slice(1, -1)}</code>);
    else if (token.startsWith('**')) out.push(<strong key={key++}>{renderInline(token.slice(2, -2))}</strong>);
    else if (token.startsWith('*')) out.push(<em key={key++}>{renderInline(token.slice(1, -1))}</em>);
    else {
      const lm = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!;
      const href = lm[2];
      const external = /^https?:/.test(href);
      out.push(
        <a key={key++} href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>
          {renderInline(lm[1])}
        </a>,
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  const flushParagraph = (buf: string[]) => {
    if (buf.length) blocks.push(<p key={key++}>{renderInline(buf.join(' '))}</p>);
    buf.length = 0;
  };

  const para: string[] = [];
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      flushParagraph(para);
      i += 1;
      continue;
    }
    if (line.startsWith('```')) {
      flushParagraph(para);
      const lang = line.slice(3).trim();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(
        <pre key={key++} data-lang={lang}>
          <code>{code.join('\n')}</code>
        </pre>,
      );
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushParagraph(para);
      const level = heading[1].length;
      const content = renderInline(heading[2]);
      blocks.push(level === 1 ? <h2 key={key++}>{content}</h2> : level === 2 ? <h2 key={key++}>{content}</h2> : level === 3 ? <h3 key={key++}>{content}</h3> : <h4 key={key++}>{content}</h4>);
      i += 1;
      continue;
    }
    if (line.startsWith('> ') || line === '>') {
      flushParagraph(para);
      const quote: string[] = [];
      while (i < lines.length && (lines[i].startsWith('> ') || lines[i] === '>')) {
        quote.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      const tag = quote[0]?.match(/^\[!([A-Z]+)\]\s*(.*)$/);
      const meta = tag ? CALLOUT_TITLES[tag[1]] : undefined;
      const body = tag ? [tag[2], ...quote.slice(1)] : quote;
      blocks.push(
        <div key={key++} className={`callout ${meta?.cls ?? 'general'}`}>
          {meta && <div className="callout-title">{meta.title}</div>}
          <Markdown text={body.join('\n')} />
        </div>,
      );
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      flushParagraph(para);
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        if (/^\s{2,}\S/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) {
          items[items.length - 1] += ' ' + lines[i].trim();
        } else {
          items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        }
        i += 1;
      }
      const children = items.map((it, idx) => <li key={idx}>{renderInline(it)}</li>);
      blocks.push(ordered ? <ol key={key++}>{children}</ol> : <ul key={key++}>{children}</ul>);
      continue;
    }
    if (line.trim().startsWith('|')) {
      flushParagraph(para);
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i].trim());
        i += 1;
      }
      const cells = (r: string) =>
        r
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());
      const header = cells(rows[0]);
      const bodyRows = rows.slice(1).filter((r) => !/^\|?\s*:?-{2,}/.test(r));
      blocks.push(
        <div key={key++} className="table-wrap">
          <table>
            <thead>
              <tr>
                {header.map((h, idx) => (
                  <th key={idx}>{renderInline(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((r, ri) => (
                <tr key={ri}>
                  {cells(r).map((c, ci) => (
                    <td key={ci}>{renderInline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    para.push(line.trim());
    i += 1;
  }
  flushParagraph(para);
  return <div className="md">{blocks}</div>;
}

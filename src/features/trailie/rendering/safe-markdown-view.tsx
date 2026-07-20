import { Fragment, type ReactNode } from "react";

import { sanitizeTrailieMarkdown } from "./safe-markdown";

function inline(value: string): ReactNode[] {
  const result: ReactNode[] = [];
  const pattern =
    /\[([^\]]+)\]\((https:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/gu;
  let cursor = 0;
  let index = 0;
  for (const match of value.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) result.push(value.slice(cursor, start));
    if (match[1] && match[2]) {
      result.push(
        <a
          className="focus-visible:ring-ring underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
          href={match[2]}
          key={index}
          rel="noreferrer"
          target="_blank"
        >
          {match[1]}
        </a>,
      );
    } else if (match[3]) {
      result.push(<strong key={index}>{match[3]}</strong>);
    } else if (match[4]) {
      result.push(<em key={index}>{match[4]}</em>);
    }
    cursor = start + match[0].length;
    index += 1;
  }
  if (cursor < value.length) result.push(value.slice(cursor));
  return result;
}

function isTableDivider(value: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(value);
}

function cells(value: string) {
  return value
    .trim()
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function SafeMarkdownView({ markdown }: { markdown: string }) {
  const lines = sanitizeTrailieMarkdown(markdown).split("\n");
  const nodes: ReactNode[] = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index]?.trimEnd() ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/u);
    if (heading) {
      const level = heading[1]?.length ?? 3;
      const content = inline(heading[2] ?? "");
      nodes.push(
        level === 1 ? (
          <h4 className="text-base font-semibold" key={index}>
            {content}
          </h4>
        ) : level === 2 ? (
          <h5 className="text-sm font-semibold" key={index}>
            {content}
          </h5>
        ) : (
          <h6 className="text-sm font-medium" key={index}>
            {content}
          </h6>
        ),
      );
      index += 1;
      continue;
    }

    if (
      line.includes("|") &&
      lines[index + 1] &&
      isTableDivider(lines[index + 1] ?? "")
    ) {
      const header = cells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && (lines[index] ?? "").includes("|")) {
        rows.push(cells(lines[index] ?? ""));
        index += 1;
      }
      nodes.push(
        <div
          className="border-border overflow-x-auto rounded-md border"
          key={index}
        >
          <table className="w-full min-w-80 text-left text-xs">
            <thead className="bg-subtle">
              <tr>
                {header.map((cell, cellIndex) => (
                  <th className="px-3 py-2 font-semibold" key={cellIndex}>
                    {inline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td className="px-3 py-2" key={cellIndex}>
                      {inline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^[-*]\s+/u.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/u.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^[-*]\s+/u, ""));
        index += 1;
      }
      nodes.push(
        <ul className="list-disc space-y-1 pl-5 text-sm" key={index}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{inline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/u.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/u.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\d+\.\s+/u, ""));
        index += 1;
      }
      nodes.push(
        <ol className="list-decimal space-y-1 pl-5 text-sm" key={index}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{inline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (/^>\s?/u.test(line)) {
      const quotes: string[] = [];
      while (index < lines.length && /^>\s?/u.test(lines[index] ?? "")) {
        quotes.push((lines[index] ?? "").replace(/^>\s?/u, ""));
        index += 1;
      }
      nodes.push(
        <blockquote
          className="border-border text-muted-foreground border-l-2 pl-3 text-sm"
          key={index}
        >
          {quotes.map((quote, quoteIndex) => (
            <Fragment key={quoteIndex}>
              {quoteIndex > 0 ? <br /> : null}
              {inline(quote)}
            </Fragment>
          ))}
        </blockquote>,
      );
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      (lines[index] ?? "").trim() &&
      !/^(#{1,3})\s+|^[-*]\s+|^\d+\.\s+|^>\s?/u.test(lines[index] ?? "")
    ) {
      if (
        paragraph.length > 0 &&
        (lines[index] ?? "").includes("|") &&
        isTableDivider(lines[index + 1] ?? "")
      )
        break;
      paragraph.push((lines[index] ?? "").trim());
      index += 1;
    }
    nodes.push(
      <p className="text-sm leading-6" key={index}>
        {inline(paragraph.join(" "))}
      </p>,
    );
  }

  return <div className="space-y-2">{nodes}</div>;
}

"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders assistant output.
 *
 * "Output format matching" is a must-have: ask for a table and you should get a
 * table, not a row of pipe characters. GFM is enabled for tables and strikethrough.
 *
 * User messages are deliberately not rendered this way. A consultant typing an
 * underscore or a hash meant those characters, not emphasis.
 *
 * Every element is mapped explicitly rather than left to browser defaults, so
 * output inherits the design tokens instead of arriving as unstyled HTML. No
 * raw HTML is enabled, so model output cannot inject markup.
 */
const COMPONENTS: Components = {
  p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{children}</p>,

  h1: ({ children }) => (
    <h1 className="font-display mt-5 mb-2 text-lg font-bold first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="font-display mt-5 mb-2 text-base font-bold first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="font-display mt-4 mb-1.5 text-sm font-semibold first:mt-0">
      {children}
    </h3>
  ),

  ul: ({ children }) => (
    <ul className="my-3 list-disc space-y-1 pl-5 marker:text-slate-light">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 list-decimal space-y-1 pl-5 marker:text-slate-light">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,

  strong: ({ children }) => (
    <strong className="font-semibold text-ink">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,

  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-brass-strong underline underline-offset-2"
    >
      {children}
    </a>
  ),

  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-brass/40 pl-3 text-ink-muted">
      {children}
    </blockquote>
  ),

  hr: () => <hr className="my-4 border-border" />,

  code: ({ className, children }) => {
    // react-markdown marks fenced blocks with a language class; anything
    // without one is inline.
    const fenced = /language-/.test(className ?? "");
    if (!fenced) {
      return (
        <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[0.8125rem] text-ink">
          {children}
        </code>
      );
    }
    return (
      <code className="font-mono text-[0.8125rem] leading-relaxed">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg border border-border bg-surface-sunken p-3">
      {children}
    </pre>
  ),

  // Tables scroll inside their own container rather than widening the message
  // and pushing the whole conversation sideways.
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-left text-[0.8125rem]">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-border bg-surface-sunken">
      {children}
    </thead>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 font-semibold text-ink">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-t border-border px-3 py-2 align-top">{children}</td>
  ),
};

export function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed text-ink">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

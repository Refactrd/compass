/**
 * WorkspaceShell's outer container is a fixed-height flex column
 * (`h-full overflow-hidden`, sized by the layout above it), deliberately:
 * the chat page pins its composer
 * by giving its own message list a scrolling `overflow-y-auto` div inside
 * that fixed height. Every page under /engagements is ordinary long-form
 * content, not a pinned-composer layout, and inherited that fixed height
 * with no scroll container of its own, so content past the fold was simply
 * clipped rather than scrollable, caught live on the department workspace
 * once results started stacking up. This is that same scroll container,
 * applied once here instead of duplicated into every page under this route.
 */
export default function EngagementsLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-y-auto">{children}</div>;
}

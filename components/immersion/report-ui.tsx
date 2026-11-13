import { refactrdBrand } from "@/brand/token";

/**
 * The shared visual language of the department result tabs (current
 * workflow, what we found, transformed workflow, recommendations): one
 * header, one section heading, one pill, one card, so the tabs read as one
 * designed report rather than four screens built separately. Refactrd's
 * brand, not Compass's own palette, because every tab previews what the
 * client sees in the PDF.
 *
 * Inline styles only, matching the views that use them: these render inside
 * the result panel and mirror react-pdf templates, which have no Tailwind.
 */

export const { colors, typography } = refactrdBrand;
export const wf = colors.workflow;

export const eyebrow: React.CSSProperties = {
  margin: 0,
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

export const heading: React.CSSProperties = {
  margin: 0,
  fontFamily: typography.heading.fontFamily,
  fontWeight: 700,
  color: colors.primary,
};

export const body: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: "12.5px",
  lineHeight: "18px",
};

export const card: React.CSSProperties = {
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  backgroundColor: "#ffffff",
  border: `1px solid ${wf.stageBorder}`,
  borderRadius: "12px",
  padding: "16px",
  boxShadow: "0 1px 2px rgba(31, 42, 68, 0.04)",
};

export type Tone = "dark" | "accent" | "azure" | "amber" | "amberStrong" | "muted";

const TONES: Record<Tone, React.CSSProperties> = {
  dark: { backgroundColor: colors.primary, color: colors.background },
  accent: { backgroundColor: colors.accent, color: colors.background },
  azure: { backgroundColor: wf.opportunityFill, color: colors.accent },
  amber: { backgroundColor: wf.bottleneckFill, color: wf.bottleneckLabel },
  amberStrong: { backgroundColor: wf.breaks, color: colors.background },
  muted: { backgroundColor: colors.tertiary, color: colors.primary },
};

export function Pill({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        fontSize: "10.5px",
        fontWeight: 700,
        lineHeight: "16px",
        padding: "2px 9px",
        borderRadius: "999px",
        whiteSpace: "nowrap",
        ...TONES[tone],
      }}
    >
      {children}
    </span>
  );
}

/** Page frame: brand background, generous gutters, and a max width so the
 * expanded (full-screen) panel never stretches cards edge to edge. */
export function ReportShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: typography.body.fontFamily,
        color: colors.primary,
        backgroundColor: colors.background,
        padding: "32px 28px 48px",
        minHeight: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: "1180px", margin: "0 auto" }}>{children}</div>
    </div>
  );
}

export type Stat = { label: string; value: string };
export type LegendItem = { swatch: React.CSSProperties; label: string };

/** Every tab opens the same way: eyebrow, title, one-line subtitle, a row
 * of headline stats, and the legend for the cards below, closed by a rule. */
export function ReportHeader({
  kicker,
  title,
  subtitle,
  stats = [],
  legend = [],
}: {
  kicker: string;
  title: string;
  subtitle: string;
  stats?: Stat[];
  legend?: LegendItem[];
}) {
  return (
    <header style={{ paddingBottom: "20px", marginBottom: "24px", borderBottom: `1px solid ${wf.stageBorder}` }}>
      <p style={{ ...eyebrow, color: colors.accent }}>{kicker}</p>
      <h2 style={{ ...heading, fontSize: "24px", lineHeight: 1.2, margin: "8px 0 6px", letterSpacing: "-0.01em" }}>
        {title}
      </h2>
      <p style={{ margin: 0, fontSize: "13.5px", lineHeight: "20px", color: wf.muted, maxWidth: "720px" }}>
        {subtitle}
      </p>
      {stats.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "16px" }}>
          {stats.map((stat) => (
            <div
              key={stat.label}
              style={{
                padding: "8px 14px",
                borderRadius: "10px",
                backgroundColor: colors.tertiary,
                minWidth: "96px",
              }}
            >
              <p style={{ ...heading, fontSize: "18px", lineHeight: 1.2 }}>{stat.value}</p>
              <p style={{ margin: "2px 0 0", fontSize: "11px", color: wf.muted }}>{stat.label}</p>
            </div>
          ))}
        </div>
      ) : null}
      {legend.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginTop: "16px" }}>
          {legend.map((item) => (
            <span
              key={item.label}
              style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: wf.muted }}
            >
              <span style={{ width: "12px", height: "12px", borderRadius: "3px", ...item.swatch }} />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
    </header>
  );
}

export function SectionHeading({ kicker, title, note }: { kicker: string; title: string; note?: string }) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <p style={{ ...eyebrow, color: colors.accent }}>{kicker}</p>
      <h3 style={{ ...heading, fontSize: "18px", margin: "4px 0 0" }}>{title}</h3>
      {note ? <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: wf.muted }}>{note}</p> : null}
    </div>
  );
}

export function Section({
  kicker,
  title,
  note,
  children,
}: {
  kicker: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: "36px" }}>
      <SectionHeading kicker={kicker} title={title} note={note} />
      {children}
    </section>
  );
}

export function Grid({ min, gap = 14, children }: { min: number; gap?: number; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
        gap: `${gap}px`,
      }}
    >
      {children}
    </div>
  );
}

/** Consultant-only detail (evidence, grounding), folded so the card still
 * reads at a glance. */
export function Folded({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details style={{ marginTop: "10px" }}>
      <summary style={{ cursor: "pointer", fontSize: "11px", fontWeight: 600, color: wf.muted }}>{label}</summary>
      <div style={{ marginTop: "6px", fontSize: "11.5px", lineHeight: "16px", color: wf.muted }}>{children}</div>
    </details>
  );
}

export function NumberBadge({ n, tone = "azure" }: { n: number; tone?: "azure" | "dark" }) {
  return (
    <span
      style={{
        flexShrink: 0,
        width: "26px",
        height: "26px",
        borderRadius: "999px",
        backgroundColor: tone === "dark" ? colors.primary : colors.secondary,
        color: tone === "dark" ? colors.background : colors.primary,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "10.5px",
        fontWeight: 700,
      }}
    >
      {String(n).padStart(2, "0")}
    </span>
  );
}

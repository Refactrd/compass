import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

/**
 * Shared shell for every transactional email Compass sends.
 *
 * Mirrors the app's own design tokens (app/globals.css) rather than
 * reinventing a palette for email. Two color modes, not one: `.card`/`.ink`/
 * etc. carry the light values as plain inline-safe classes, and the
 * `<style>` block below overrides them under `prefers-color-scheme: dark`
 * and under `[data-ogsc]` (Outlook.com / Windows Mail's own dark-mode
 * attribute, which ignores the media query entirely) so the dark palette
 * actually applies in the clients that only support one mechanism or the
 * other.
 *
 * Text-only wordmark, no logo image: a remote image is invisible until the
 * reader explicitly loads it in most mail clients, so the brand identity
 * would be blank on first open. Styled text renders instantly everywhere.
 */

const styles = `
  .body { background-color: #faf9f6; }
  .card { background-color: #ffffff; border-color: #e4e1da; }
  .ink { color: #1c1c1e; }
  .ink-muted { color: #45464a; }
  .slate { color: #6e7076; }
  .hr { border-color: #e4e1da; }
  .brand { color: #b08d57; }
  .btn { background-color: #8a6d3f; }
  .btn-text { color: #ffffff !important; }

  @media (prefers-color-scheme: dark) {
    .body { background-color: #262624 !important; }
    .card { background-color: #30302e !important; border-color: #3b3a37 !important; }
    .ink { color: #f5f4ee !important; }
    .ink-muted { color: #c8c5ba !important; }
    .slate { color: #9c9a92 !important; }
    .hr { border-color: #3b3a37 !important; }
    .brand { color: #c9a46a !important; }
    .btn { background-color: #c9a46a !important; }
    .btn-text { color: #1c1c1e !important; }
  }

  [data-ogsc] .body { background-color: #262624 !important; }
  [data-ogsc] .card { background-color: #30302e !important; border-color: #3b3a37 !important; }
  [data-ogsc] .ink { color: #f5f4ee !important; }
  [data-ogsc] .ink-muted { color: #c8c5ba !important; }
  [data-ogsc] .slate { color: #9c9a92 !important; }
  [data-ogsc] .hr { border-color: #3b3a37 !important; }
  [data-ogsc] .brand { color: #c9a46a !important; }
  [data-ogsc] .btn { background-color: #c9a46a !important; }
  [data-ogsc] .btn-text { color: #1c1c1e !important; }
`;

const fontFamily =
  '"Plus Jakarta Sans","IBM Plex Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

export function EmailLayout({
  preview,
  children,
}: {
  preview: string;
  children: React.ReactNode;
}) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>{styles}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body className="body" style={{ margin: 0, padding: "32px 16px", fontFamily }}>
        <Container
          className="card"
          style={{
            maxWidth: "480px",
            margin: "0 auto",
            border: "1px solid",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          <Section style={{ padding: "32px 32px 8px" }}>
            <Text
              className="brand"
              style={{
                fontSize: "13px",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                margin: 0,
              }}
            >
              Compass
            </Text>
          </Section>

          <Section style={{ padding: "8px 32px 32px" }}>{children}</Section>

          <Hr className="hr" style={{ margin: 0 }} />

          <Section style={{ padding: "20px 32px" }}>
            <Text className="slate" style={{ fontSize: "12px", lineHeight: "18px", margin: 0 }}>
              Refactrd &middot; internal consultant tool. You are receiving this
              because an admin took an action on your Compass account. If that
              was not expected, you can ignore this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function EmailHeading({ children }: { children: React.ReactNode }) {
  return (
    <Text
      className="ink"
      style={{ fontSize: "20px", fontWeight: 700, lineHeight: "28px", margin: "0 0 12px" }}
    >
      {children}
    </Text>
  );
}

export function EmailBody({ children }: { children: React.ReactNode }) {
  return (
    <Text
      className="ink-muted"
      style={{ fontSize: "15px", lineHeight: "24px", margin: "0 0 20px" }}
    >
      {children}
    </Text>
  );
}

/**
 * Table-based button rather than @react-email/components' <Button>: a plain
 * anchor with padding collapses in Outlook's Word rendering engine, and this
 * is the one element in the email that has to stay clickable everywhere.
 */
export function EmailButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: "4px 0 24px" }}>
      <tbody>
        <tr>
          <td className="btn" style={{ borderRadius: "8px" }}>
            <a
              href={href}
              className="btn-text"
              style={{
                display: "inline-block",
                padding: "12px 24px",
                fontSize: "15px",
                fontWeight: 600,
                textDecoration: "none",
                borderRadius: "8px",
                fontFamily,
              }}
            >
              {children}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function EmailFinePrint({ children }: { children: React.ReactNode }) {
  return (
    <Text className="slate" style={{ fontSize: "13px", lineHeight: "20px", margin: "0 0 4px" }}>
      {children}
    </Text>
  );
}

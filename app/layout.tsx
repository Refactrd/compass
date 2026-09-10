import type { Metadata } from "next";
import { IBM_Plex_Sans, Plus_Jakarta_Sans } from "next/font/google";

import { ToastProvider } from "@/components/ui/toast";
import { getTheme } from "@/lib/theme";
import "./globals.css";

// CLAUDE.md, "Design system": Plus Jakarta Sans for headings and the wordmark,
// IBM Plex Sans for body and UI. Not Inter, not Space Grotesk.
const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Compass",
  description: "Refactrd consultant intelligence platform",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = await getTheme();

  return (
    <html
      lang="en"
      // Resolved server side, so the correct theme is present in the first byte
      // of HTML and there is no flash of the wrong one. "system" sets nothing,
      // leaving the prefers-color-scheme rules in globals.css to decide.
      data-theme={theme === "system" ? undefined : theme}
      className={`${plusJakarta.variable} ${ibmPlexSans.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

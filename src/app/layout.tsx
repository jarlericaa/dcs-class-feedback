import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
// KaTeX ships its own stylesheet; without it every formula renders as a pile of
// unpositioned spans. Loaded here, once, rather than per page.
import "katex/dist/katex.min.css";
import "./globals.css";
import { BOARD } from "@/lib/theme";

/**
 * Charter is the document register: text a person wrote, and the titles of the
 * things they read. Self-hosted, Latin subset, three faces (~60 KB total).
 * Interface chrome stays on the platform sans. See DESIGN.md §2 and
 * src/app/fonts/LICENSE.md.
 */
const documentFace = localFont({
  src: [
    { path: "./fonts/XCharter-Roman.woff2", weight: "400", style: "normal" },
    { path: "./fonts/XCharter-Italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/XCharter-Bold.woff2", weight: "700", style: "normal" },
  ],
  /**
   * The FACE, not the register. `--font-document` is the Tailwind theme token
   * (globals.css `@theme`) holding the whole stack — this face plus its
   * fallbacks — so the two cannot share a name without one shadowing the other.
   */
  variable: "--font-document-face",
  display: "swap",
  fallback: [
    "Charter",
    "Bitstream Charter",
    "Iowan Old Style",
    "Georgia",
    "serif",
  ],
});

export const metadata: Metadata = {
  title: "Class Feedback",
  description:
    "Class feedback for university sections: submit, review, answer privately, and publish anonymous answers to your class.",
};

export const viewport: Viewport = {
  /* `--color-board`, by way of the one module allowed to restate a token value.
     A test holds the two together; see src/lib/theme.ts. When dark mode lands
     this becomes the two-entry `prefers-color-scheme` form (DESIGN-TODO §6.4). */
  themeColor: BOARD,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={documentFace.variable}>
      <body>{children}</body>
    </html>
  );
}

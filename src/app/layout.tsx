import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
// KaTeX ships its own stylesheet; without it every formula renders as a pile of
// unpositioned spans. Loaded here, once, rather than per page.
import "katex/dist/katex.min.css";
import "./globals.css";

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
  variable: "--font-document",
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
    "Weekly class feedback for university sections: submit, review, answer privately, and publish anonymous answers to your class.",
};

export const viewport: Viewport = {
  themeColor: "#e9e8de",
  width: "device-width",
  initialScale: 1,
};

/**
 * The design direction this interface is built to, kept in the emitted markup
 * so it can still be audited after a production build. React drops JSX
 * comments, so this ships as a real HTML comment. DESIGN.md is the full
 * document; this is the contract in six lines.
 */
const DIRECTION_CONTRACT = `<!--
  THESIS: a departmental noticeboard, not a dashboard — typed notices squared
  onto a matte board, dated, stamped, never rounded into cards. It refuses the
  sidebar-plus-rounded-card admin panel and the coloured brand band that this
  category always ships.
  OWN-WORLD: matte board #e9e8de, white paper sheets at zero radius, hairline
  rules carrying all structure, one institutional green with amber and red in
  reserve, and two type registers — Charter for text a human wrote, platform
  sans for everything the system says.
  STORY: a student sees what is open, what it costs them, and who can see it,
  then finishes; staff read a week of submissions as posted notices they can
  triage, answer and stamp.
  FIRST VIEWPORT: white top bar over a board-toned rail of real destinations,
  then the week's own notice — title, closing time, and the primary action on
  the sheet itself.
  FORM: the departmental noticeboard, candidate 4 of the grounded list; seed
  key d33d61b4.
  FINISH: unreviewed and undocumented is unfinished; this build ends with the
  finish review, the verdict, and DESIGN.md.
-->`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={documentFace.variable}>
      <body>
        <div
          hidden
          dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }}
        />
        {children}
      </body>
    </html>
  );
}

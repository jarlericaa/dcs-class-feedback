import type { Metadata } from "next";
import type { ReactNode } from "react";
// KaTeX ships its own stylesheet; without it every formula renders as a pile of
// unpositioned spans. Loaded here, once, rather than per page.
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Class Feedback",
  description:
    "Weekly class feedback for university sections: submit, review, answer privately, and publish anonymous answers to your class.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

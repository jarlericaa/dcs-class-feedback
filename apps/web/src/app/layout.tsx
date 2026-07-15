import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Class Feedback Platform",
  description: "Feedback and Q&A platform for classes",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

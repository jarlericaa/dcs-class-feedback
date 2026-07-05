import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Class Feedback",
  description: "Recurring weekly class feedback platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          maxWidth: "56rem",
          margin: "0 auto",
          padding: "1rem",
        }}
      >
        {children}
      </body>
    </html>
  );
}

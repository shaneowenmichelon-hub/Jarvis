import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Sponsor Command",
  description: "Inbound sponsorship pipeline for ZMM Events, synced from Gmail every hour.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * Applies the saved theme before first paint. Without this the page renders in
 * the OS theme for a frame and then flips, which reads as a bug.
 */
const THEME_SCRIPT = `
try {
  var stored = localStorage.getItem('sc-theme');
  if (stored === 'light' || stored === 'dark') {
    document.documentElement.setAttribute('data-theme', stored);
  }
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

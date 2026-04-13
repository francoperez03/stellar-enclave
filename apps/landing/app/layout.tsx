import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Enclave — Shielded Organizations for Agentic Commerce",
  description: "Your agents. Your rules. Out of sight.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased font-sans min-h-screen bg-cream text-ink-900">
        {children}
      </body>
    </html>
  );
}

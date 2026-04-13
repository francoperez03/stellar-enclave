import "./globals.css";
import type { Metadata } from "next";
import { DM_Serif_Display, Outfit, JetBrains_Mono } from "next/font/google";
import { LenisProvider } from "@/components/providers/LenisProvider";
import { MotionProvider } from "@/components/providers/MotionProvider";

const dmSerifDisplay = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-headline",
});

const outfit = Outfit({
  weight: ["400", "600"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  weight: ["400", "600"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Enclave — Shielded Organizations for Agentic Commerce",
  description:
    "Your agents. Your rules. Out of sight. Shielded organizations for autonomous agents on Stellar.",
  openGraph: {
    title: "Enclave — Shielded Organizations for Agentic Commerce",
    description:
      "Shielded organizations for autonomous agents on Stellar. Your agents. Your rules. Out of sight.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Enclave — Shielded Organizations for Agentic Commerce",
    description: "Your agents. Your rules. Out of sight.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${dmSerifDisplay.variable} ${outfit.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased font-sans min-h-screen bg-cream text-ink-900">
        <LenisProvider>
          <MotionProvider>{children}</MotionProvider>
        </LenisProvider>
      </body>
    </html>
  );
}

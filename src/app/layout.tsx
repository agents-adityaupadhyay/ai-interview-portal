import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import { validateEnv } from "@/lib/env";
import { themeInitScript } from "@/lib/theme-script";
import "./globals.css";

validateEnv();

// Self-hosted at build time: no render-blocking request to Google at runtime.
const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
// Headings: Inter Tight, the closest Google-hosted match to Inter Display.
const display = Inter_Tight({ subsets: ["latin"], variable: "--font-display", display: "swap", weight: ["500", "600", "700"] });
// Numbers, dates, IDs and shortcuts.
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: {
    default: "InterviewAI",
    template: "%s | InterviewAI",
  },
  description: "AI-powered voice & video interview platform with real-time proctoring",
  icons: {
    icon: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { DM_Mono, Unbounded } from "next/font/google";
import "./globals.css";

const display = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const mono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  title: "AV/01 — Audio Visualizer",
  description:
    "A local-first visual instrument that transforms rhythm, timbre and texture into living GPU scenes.",
  applicationName: "AV/01 Audio Visualizer",
  keywords: [
    "audio visualizer",
    "music visualizer",
    "Web Audio",
    "real-time graphics",
    "audio reactive",
    "creative coding",
  ],
  authors: [{ name: "Audio Visualizer" }],
  category: "music",
  openGraph: {
    title: "AV/01 — Sound, seen.",
    description: "A real-time visual instrument for music, system audio and live input.",
    type: "website",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { DM_Mono, Unbounded } from "next/font/google";
import { BRAND_PIGMENTS } from "@/lib/visualizer/types";
import "./globals.css";

const display = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const mono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "AV/01 — Audio Visualizer",
  description:
    "A local-first signal instrument with five scientifically grounded audio views and controlled reference signals.",
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
    title: "AV/01 — Five views. One signal.",
    description: "A real-time visual instrument with controlled, locally generated audio references.",
    type: "website",
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: BRAND_PIGMENTS.reference,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

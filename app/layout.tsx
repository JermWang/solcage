import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "react-casino-roulette/dist/index.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SolCage — Collateral in. Game on.",
  description: "Collateralize eligible Solana memecoins above $10M market cap, access a risk-adjusted credit line, and play on the SolCage floor.",
  metadataBase: new URL("https://casinolend-production.up.railway.app"),
  openGraph: {
    title: "SolCage — Keep your bag. Borrow the thrill.",
    description: "Solana-native memecoin credit, game settlement and loyalty in one wallet-connected platform.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "SolCage" }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@solcage_",
    creator: "@solcage_",
    title: "SolCage — Keep your bag. Borrow the thrill.",
    description: "Solana-native memecoin credit, game settlement and loyalty in one wallet-connected platform.",
    images: ["/og.png"],
  },
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "64x64" }],
    shortcut: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

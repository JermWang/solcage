import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
  description: "Collateralize eligible Solana memecoins above $10M market cap, draw demo chips, and play four original GameFi prototypes.",
  metadataBase: new URL("https://casinolend-production.up.railway.app"),
  openGraph: {
    title: "SolCage — Keep your bag. Borrow the thrill.",
    description: "Collateralize eligible Solana memecoins, draw demo chips, and explore the living game floor.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "SolCage" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SolCage — Keep your bag. Borrow the thrill.",
    description: "Collateralize eligible Solana memecoins, draw demo chips, and explore the living game floor.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
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

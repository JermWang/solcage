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
  description: "A Solana-native collateral lending and gaming concept. Lock assets, draw demo chips, and explore the floor.",
  metadataBase: new URL("https://solcage.sites.openai.com"),
  openGraph: {
    title: "SolCage — Keep your bag. Borrow the thrill.",
    description: "A Solana-native collateral lending and gaming concept.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "SolCage" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SolCage — Keep your bag. Borrow the thrill.",
    description: "A Solana-native collateral lending and gaming concept.",
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

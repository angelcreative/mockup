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
  title: "Mockup",
  description: "Open a site on a 3D device and browse it live.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/app.svg", type: "image/svg+xml" },
      { url: "/icons/app-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/app-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/app.png", sizes: "1024x1024", type: "image/png" },
    ],
    apple: [{ url: "/icons/app-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-dvh overflow-hidden overscroll-none bg-white font-sans text-neutral-950">
        {children}
      </body>
    </html>
  );
}

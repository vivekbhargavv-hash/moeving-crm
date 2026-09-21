import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";

import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

export const metadata: Metadata = {
  title: "Good Deal",
  description: "Pipeline, forecast and margins for the MoEVing EV logistics team.",
  manifest: "/manifest.webmanifest",
  // `src/app/favicon.ico` is picked up by Next on its own; these are the sizes
  // a browser tab and an iOS home screen ask for on top of it.
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "Good Deal",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en-IN">
        <body className="min-h-dvh antialiased">
          {children}
          <ServiceWorker />
        </body>
      </html>
    </ClerkProvider>
  );
}

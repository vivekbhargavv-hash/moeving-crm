import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";

import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

export const metadata: Metadata = {
  title: "Good Deal",
  description: "Pipeline, forecast and margins for the MoEVing EV logistics team.",
  manifest: "/manifest.webmanifest",
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
      <html lang="en">
        <body className="min-h-dvh antialiased">
          {children}
          <ServiceWorker />
        </body>
      </html>
    </ClerkProvider>
  );
}

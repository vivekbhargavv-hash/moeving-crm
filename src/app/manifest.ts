import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Good Deal",
    short_name: "Good Deal",
    description: "Sales pipeline for the MoEVing EV logistics team.",
    start_url: "/pipeline",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android crops a maskable icon to the launcher's shape, so this one is
      // a separate file: opaque, with the mark inside the circular safe zone.
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "New deal", url: "/pipeline?new=1" },
      { name: "Forecast", url: "/forecast" },
    ],
  };
}

  import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StudyMate",
    short_name: "StudyMate",
    description: "A voice-first study companion you can talk to.",
    start_url: "/",
    display: "standalone",
    background_color: "#05080a",
    theme_color: "#05080a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
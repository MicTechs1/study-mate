import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "StudyMate — A voice-first study companion",
    template: "%s · StudyMate",
  },
  description:
    "StudyMate is a voice-first AI study companion: talk to it, show it your notes, and turn them into summaries and quizzes. Private by default.",
  applicationName: "StudyMate",
  manifest: "/manifest.webmanifest",
  keywords: ["study companion", "AI tutor", "quiz", "notes", "voice assistant"],
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "StudyMate",
    title: "StudyMate — A voice-first study companion",
    description:
      "Talk, take notes, and turn them into quizzes. AI study help that keeps your data private.",
  },
  twitter: {
    card: "summary",
    title: "StudyMate — A voice-first study companion",
    description:
      "Talk, take notes, and turn them into quizzes. AI study help that keeps your data private.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#05080a",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  return (
    <html lang="en" className={`${outfit.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
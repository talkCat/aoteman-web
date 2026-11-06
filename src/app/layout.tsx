import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import GlobalClientEffects from "@/components/GlobalClientEffects";

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
  title: "灵犀 Lumi · 智能体工作台",
  description: "面向个人与开发者的 AI 智能体工作台：对话、工具调用、技能与过程追踪。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const content = (
    <>
      {children}
      <GlobalClientEffects />
    </>
  );

  return (
    <html lang="zh-CN" suppressHydrationWarning className="dark">
      <head>
        <link
          rel="icon"
          href="/brand/lumi-mark.svg"
        />
        <meta name="theme-color" content="#0a0a0d" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#f4f4f8" media="(prefers-color-scheme: light)" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Toaster />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {content}
        </ThemeProvider>
      </body>
    </html>
  );
}
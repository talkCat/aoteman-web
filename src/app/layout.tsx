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
  title: "Aoteman Agent · 智能体工作台",
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
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link
          rel="icon"
          href={`data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🤖</text></svg>`}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Toaster />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {content}
        </ThemeProvider>
      </body>
    </html>
  );
}
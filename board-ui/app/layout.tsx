import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SuperClaw 看板',
  description: 'AI-powered project management board',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

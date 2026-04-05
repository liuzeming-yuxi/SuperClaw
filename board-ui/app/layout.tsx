import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SuperClaw Board',
  description: 'Task board for SuperClaw',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

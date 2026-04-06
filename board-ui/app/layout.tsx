import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SuperClaw 看板',
  description: 'AI 驱动的项目管理看板',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

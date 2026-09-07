import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://competency-game-three.vercel.app'),
  title: 'NINEFLOW LAB — 전략게임 트레이너',
  description: '9가지 인지 전략게임을 원리부터 반복 훈련하는 독립형 연습 도구',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    shortcut: '/icon.svg',
  },
  openGraph: {
    title: 'NINEFLOW LAB — 전략게임 트레이너',
    description: 'JOBDA 공개 게임 구조를 참고한 9가지 독립형 연습 게임',
    images: [{ url: '/og.png', width: 1729, height: 910, alt: 'NINEFLOW LAB 9가지 전략게임 트레이너' }],
  },
  twitter: { card: 'summary_large_image', images: ['/og.png'] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

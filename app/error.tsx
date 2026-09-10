'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // 개발자 콘솔에는 진단 단서를 남기되, 사용자 화면에는 내부 오류 내용을 노출하지 않는다.
    console.error('NINEFLOW route error', error);
  }, [error]);

  return (
    <main className="app-error" role="main">
      <section role="alert" aria-labelledby="app-error-title">
        <span aria-hidden="true">!</span>
        <small>RECOVERY MODE</small>
        <h1 id="app-error-title">화면을 이어서 불러오지 못했습니다.</h1>
        <p>저장된 연습 기록은 이 브라우저에 그대로 남아 있습니다. 다시 시도하거나 홈을 새로 열어 주세요.</p>
        <div><button type="button" onClick={reset}>다시 시도</button><Link href="/">홈 새로 열기</Link></div>
      </section>
    </main>
  );
}

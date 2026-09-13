'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body>
        <main className="app-error" role="main">
          <section role="alert" aria-labelledby="global-error-title">
            <span aria-hidden="true">!</span>
            <small>SAFE RECOVERY</small>
            <h1 id="global-error-title">앱을 안전하게 다시 시작할 수 있습니다.</h1>
            <p>브라우저에 저장된 기록을 지우지 않고 화면만 다시 불러옵니다.</p>
            <div><button type="button" onClick={reset}>앱 다시 불러오기</button><button className="app-error-home" type="button" onClick={() => window.location.reload()}>페이지 새로 열기</button></div>
          </section>
        </main>
      </body>
    </html>
  );
}

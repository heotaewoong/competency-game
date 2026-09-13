import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="app-error" role="main">
      <section role="alert" aria-labelledby="not-found-title">
        <span aria-hidden="true">404</span>
        <small>PAGE NOT FOUND</small>
        <h1 id="not-found-title">요청한 페이지를 찾지 못했습니다.</h1>
        <p>주소를 다시 확인하거나 홈에서 원하는 연습 게임을 선택해 주세요.</p>
        <div><Link className="app-error-primary-link" href="/">홈으로 이동</Link><Link href="/#games">게임 목록 보기</Link></div>
      </section>
    </main>
  );
}

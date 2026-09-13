import { expect, test, type APIResponse } from '@playwright/test';

function expectSecurityHeaders(response: APIResponse) {
  const headers = response.headers();
  const csp = headers['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("script-src 'self' 'unsafe-inline'");
  expect(csp).not.toContain("'unsafe-eval'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(headers['strict-transport-security']).toBe('max-age=63072000; includeSubDomains; preload');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=(), browsing-topics=()');
  expect(headers['x-powered-by']).toBeUndefined();
}

test('정상 페이지와 404는 동일한 브라우저 보호 헤더를 사용한다', async ({ page, request }) => {
  const home = await request.get('/');
  expect(home.status()).toBe(200);
  expectSecurityHeaders(home);

  const missingPath = '/없는-게임-주소';
  const missing = await request.get(missingPath);
  expect(missing.status()).toBe(404);
  expectSecurityHeaders(missing);

  const navigation = await page.goto(missingPath);
  expect(navigation?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: '요청한 페이지를 찾지 못했습니다.' })).toBeVisible();
  await expect(page.getByRole('link', { name: '게임 목록 보기' })).toHaveAttribute('href', '/#games');
});

test('버전이 붙은 대형 이미지는 반복 방문용 장기 캐시를 사용한다', async ({ request }) => {
  for (const path of ['/assets/mori-coach-hero-v2-800.webp', '/assets/appointment/food-sprite-v1.webp']) {
    const response = await request.head(path);
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  }
});

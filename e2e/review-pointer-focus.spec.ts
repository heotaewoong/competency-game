import { expect, test, type Locator } from '@playwright/test';

// Do not focus/press the opener first: that would hide Safari's pointer-origin
// focus behavior. Each test starts with a fresh, empty browser context.
for (const closeMethod of ['pointer', 'escape'] as const) {
  test(`홈 복습을 포인터로 열고 ${closeMethod}로 닫으면 진입 버튼으로 초점이 돌아온다`, async ({ page, hasTouch }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const activate = (target: Locator) => hasTouch ? target.tap() : target.click();

    await page.goto('/');
    const opener = page.getByRole('button', { name: '내 실수 복습', exact: true });
    await expect(opener).toBeEnabled();
    await expect(opener).not.toBeFocused();
    await activate(opener);

    const dialog = page.getByRole('dialog', { name: '복습 센터', exact: true });
    const close = dialog.getByRole('button', { name: '복습 센터 닫기', exact: true });
    await expect(dialog).toBeVisible();
    await expect(close).toBeFocused();
    if (closeMethod === 'escape') await page.keyboard.press('Escape');
    else await activate(close);

    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(page.locator('.site-shell > [inert]')).toHaveCount(0);
    await expect.poll(() => opener.evaluate(element => Boolean(element.closest('[inert], [aria-hidden="true"]')))).toBe(false);
    expect(errors).toEqual([]);
  });
}

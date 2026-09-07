'use client';

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { games, type GameId } from '../lib/game-data';
import { lockDocumentScroll } from '../lib/scroll-lock';
import {
  buildFeedbackIssueText,
  buildFeedbackIssueUrl,
  buildFeedbackIssuePasteUrl,
  FEEDBACK_ISSUES_URL,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_MESSAGE_MIN,
  feedbackCategories,
  feedbackIssueUrlIsSafe,
  type FeedbackCategory,
} from '../lib/feedback';

export function FeedbackDialog({ onClose, initialGameId = 'site', sessionMode, nested = false }: { onClose: () => void; initialGameId?: GameId | 'site'; sessionMode?: string; nested?: boolean }) {
  const [category, setCategory] = useState<FeedbackCategory>(initialGameId === 'site' ? 'feature' : 'bug');
  const [gameId, setGameId] = useState<GameId | 'site'>(initialGameId);
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState(0);
  const [includeEnvironment, setIncludeEnvironment] = useState(true);
  const [status, setStatus] = useState('');
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const onCloseRef = useRef(onClose);
  const trimmedLength = Array.from(message.trim()).length;
  const isValid = trimmedLength >= FEEDBACK_MESSAGE_MIN;
  const directIssueUrlSafe = feedbackIssueUrlIsSafe({ category, gameId, message, rating: rating || undefined, mode: sessionMode });

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScrollLock = lockDocumentScroll();
    const container = backdropRef.current?.parentElement;
    const siblings = !nested && container ? Array.from(container.children).filter((element) => element !== backdropRef.current) as HTMLElement[] : [];
    const siblingState = siblings.map((element) => ({ element, inert: element.inert, ariaHidden: element.getAttribute('aria-hidden') }));
    siblings.forEach((element) => { element.inert = true; element.setAttribute('aria-hidden', 'true'); });
    const focusFrame = window.requestAnimationFrame(() => noticeRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], select, textarea, input:not(:disabled)') ?? []).filter((item) => item.offsetParent !== null);
      if (!items.length) return;
      const first = items[0]; const last = items.at(-1)!;
      const active = document.activeElement;
      const activeIsTabStop = items.includes(active as HTMLElement);
      if (event.shiftKey && (active === first || !activeIsTabStop)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (active === last || !activeIsTabStop)) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', onKey, true);
      releaseScrollLock();
      siblingState.forEach(({ element, inert, ariaHidden }) => { element.inert = inert; if (ariaHidden === null) element.removeAttribute('aria-hidden'); else element.setAttribute('aria-hidden', ariaHidden); });
      previousFocus?.focus();
    };
  }, [nested]);

  function issueInput() {
    return {
      category,
      gameId,
      message,
      rating: rating || undefined,
      mode: sessionMode,
      includeEnvironment,
      viewport: includeEnvironment ? { width: window.innerWidth, height: window.innerHeight } : undefined,
      pageUrl: includeEnvironment ? `${window.location.origin}${window.location.pathname}` : undefined,
    };
  }

  function navigateRating(event: ReactKeyboardEvent<HTMLInputElement>, value: number) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const next = Math.min(5, Math.max(1, value + delta));
    setRating(next);
    window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLInputElement>(`input[name="feedback-rating"][value="${next}"]`)?.focus());
  }

  async function copyFeedback() {
    if (!isValid) { setStatus(`의견을 ${FEEDBACK_MESSAGE_MIN}자 이상 입력해 주세요.`); return; }
    const input = issueInput();
    const issueUrl = new URL(buildFeedbackIssueUrl(input));
    const copyText = `${issueUrl.searchParams.get('title')}\n\n${buildFeedbackIssueText(input)}`;
    try {
      await navigator.clipboard.writeText(copyText);
      setStatus('의견 내용을 복사했습니다. 원하는 곳에 붙여넣어 보관할 수 있습니다.');
    } catch {
      setStatus('자동 복사가 차단됐습니다. 입력한 의견을 직접 선택해 복사해 주세요.');
      messageRef.current?.select();
    }
  }

  function openIssue() {
    if (!isValid) { setStatus(`의견을 ${FEEDBACK_MESSAGE_MIN}자 이상 입력해 주세요.`); return; }
    const input = issueInput();
    if (feedbackIssueUrlIsSafe(input)) {
      window.open(buildFeedbackIssueUrl(input), '_blank', 'noopener,noreferrer');
      setStatus('GitHub에서 공개 범위를 확인한 뒤 제출해 주세요. 새 창이 보이지 않으면 내용을 복사해 주세요.');
      return;
    }
    window.open(buildFeedbackIssuePasteUrl(input), '_blank', 'noopener,noreferrer');
    const issueUrl = new URL(buildFeedbackIssueUrl(input));
    const copyText = `${issueUrl.searchParams.get('title')}\n\n${buildFeedbackIssueText(input)}`;
    void navigator.clipboard.writeText(copyText).then(() => {
      setStatus('긴 의견 전체를 복사했습니다. 열린 GitHub 이슈 본문에 붙여넣어 주세요. 새 창이 보이지 않으면 공개 의견 모아보기를 이용하세요.');
    }).catch(() => {
      setStatus('GitHub 이슈 창은 열었지만 자동 복사가 차단됐습니다. 입력한 의견을 직접 복사해 본문에 붙여넣어 주세요.');
      messageRef.current?.select();
    });
  }

  return (
    <div ref={backdropRef} className="feedback-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-title" aria-describedby="feedback-public-notice" tabIndex={-1}>
        <header>
          <div><span>PUBLIC FEEDBACK</span><h2 id="feedback-title">의견 보내기</h2><p>오류·규칙·난이도·기능 의견을 공개 이슈로 모읍니다.</p></div>
          <button type="button" aria-label="의견 보내기 닫기" onClick={onClose}>×</button>
        </header>

        <div ref={noticeRef} id="feedback-public-notice" className="feedback-notice" role="note" tabIndex={-1}><b>제출 내용은 GitHub에 공개됩니다.</b><span>이름·연락처·회사 지원 정보·점수처럼 개인을 알아볼 수 있는 내용은 입력하지 마세요.</span></div>

        <div className="feedback-fields">
          <label><span>의견 유형</span><select value={category} onChange={(event) => setCategory(event.target.value as FeedbackCategory)}>{feedbackCategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label><span>관련 게임</span><select value={gameId} onChange={(event) => setGameId(event.target.value as GameId | 'site')}><option value="site">사이트 전체</option>{games.map((game) => <option key={game.id} value={game.id}>{game.no} · {game.title}</option>)}</select></label>
        </div>

        <fieldset className="feedback-rating"><legend>현재 사용 만족도 <small>선택 사항</small></legend><div>{[1, 2, 3, 4, 5].map((value) => <label key={value}><input type="radio" name="feedback-rating" value={value} checked={rating === value} onChange={() => setRating(value)} onKeyDown={(event) => navigateRating(event, value)} /><b>{value}</b><span>{value === 1 ? '불편' : value === 3 ? '보통' : value === 5 ? '만족' : ''}</span></label>)}</div></fieldset>

        <label className="feedback-message"><span>의견 내용 <small>{trimmedLength} / {FEEDBACK_MESSAGE_MAX}</small></span><textarea ref={messageRef} aria-describedby="feedback-public-notice" value={message} minLength={FEEDBACK_MESSAGE_MIN} maxLength={FEEDBACK_MESSAGE_MAX} rows={7} placeholder="어떤 화면에서 무엇이 달랐는지, 기대한 동작은 무엇인지 적어주세요." onChange={(event) => { setMessage(event.target.value); setStatus(''); }} /></label>

        <label className="feedback-environment"><input type="checkbox" checked={includeEnvironment} onChange={(event) => setIncludeEnvironment(event.target.checked)} /><span><b>비식별 환경정보 함께 보내기</b><small>현재 게임·모드·화면 크기·페이지 주소만 포함하며 점수와 응답 내용은 보내지 않습니다.</small></span></label>

        <p className="feedback-status" aria-live="polite">{status || (isValid ? directIssueUrlSafe ? 'GitHub에서 내용을 한 번 더 확인한 뒤 최종 제출합니다.' : '긴 의견은 전체 내용을 복사한 뒤 안전한 빈 GitHub 이슈 창을 엽니다.' : `최소 ${FEEDBACK_MESSAGE_MIN}자 이상 입력해 주세요.`)}</p>
        <div className="feedback-actions">
          <button type="button" className="feedback-copy" onClick={copyFeedback}>내용 복사</button>
          <a href={FEEDBACK_ISSUES_URL} target="_blank" rel="noreferrer">공개 의견 모아보기 ↗</a>
          <button type="button" className="feedback-submit" disabled={!isValid} onClick={openIssue}>{directIssueUrlSafe ? 'GitHub에서 검토 후 제출' : '복사 후 GitHub 열기'} <span>→</span></button>
        </div>
        <small className="feedback-footnote">GitHub 로그인이 필요합니다. 계정이 없거나 제출하지 않으려면 ‘내용 복사’를 이용하세요.</small>
      </section>
    </div>
  );
}

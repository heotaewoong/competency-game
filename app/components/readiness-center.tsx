'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { GameId } from '../lib/game-data';
import { essentialAssetPathsFor } from '../lib/essential-assets';
import {
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  assessReadiness,
  parseAccessibilityPreferences,
  resolveReadinessOverall,
  serializeAccessibilityPreferences,
  type AccessibilityPreferences,
  type ReadinessAssetStatus,
  type ReadinessAssessment,
  type ReadinessOverall,
} from '../lib/readiness';

export const ACCESSIBILITY_STORAGE_KEY = 'nineflow-accessibility-v1';
export const READINESS_STORAGE_KEY = 'nineflow-readiness-check-v1';

const readinessLabels: Record<ReadinessOverall, string> = {
  ready: '연습 준비 완료',
  review: '시작 전 확인 필요',
  blocked: '환경 조정 필요',
};

const ASSET_PRELOAD_TIMEOUT_MS = 6_000;

export type SavedReadinessSummary = {
  overall: ReadinessOverall;
  checkedAt: string;
  assetStatus: ReadinessAssetStatus;
};

function isReadinessOverall(value: unknown): value is ReadinessOverall {
  return value === 'ready' || value === 'review' || value === 'blocked';
}

export function parseSavedReadinessSummary(raw: string | null): SavedReadinessSummary | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { version?: unknown; overall?: unknown; checkedAt?: unknown; assetStatus?: unknown };
    if (value?.version !== 1 || !isReadinessOverall(value.overall) || typeof value.checkedAt !== 'string' || !Number.isFinite(Date.parse(value.checkedAt))) return null;
    // v1 snapshots written before assetStatus existed are kept compatible. A
    // previous warning is conservatively treated as an asset warning; a stale
    // viewport block can then recover when the browser is enlarged.
    const assetStatus: ReadinessAssetStatus = value.assetStatus === 'ready' || value.assetStatus === 'review'
      ? value.assetStatus
      : value.overall === 'ready' ? 'ready' : 'review';
    return { overall: value.overall, checkedAt: value.checkedAt, assetStatus };
  } catch {
    return null;
  }
}

export function applyAccessibilityPreferences(preferences: AccessibilityPreferences) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.contrast = preferences.contrast;
  root.dataset.textScale = preferences.textScale;
  root.dataset.motion = preferences.motion;
}

function readStoredAccessibilityPreferences() {
  if (typeof window === 'undefined') return { ...DEFAULT_ACCESSIBILITY_PREFERENCES };
  try { return parseAccessibilityPreferences(window.localStorage.getItem(ACCESSIBILITY_STORAGE_KEY)); }
  catch { return { ...DEFAULT_ACCESSIBILITY_PREFERENCES }; }
}

function persistAccessibilityPreferences(preferences: AccessibilityPreferences) {
  applyAccessibilityPreferences(preferences);
  try { window.localStorage.setItem(ACCESSIBILITY_STORAGE_KEY, serializeAccessibilityPreferences(preferences)); }
  catch { /* 저장소가 막혀도 현재 탭에는 즉시 적용한다. */ }
}

export function currentAccessibilityProfile() {
  if (typeof document === 'undefined') return 'standard|standard|system';
  const root = document.documentElement.dataset;
  return `${root.contrast ?? 'standard'}|${root.textScale ?? 'standard'}|${root.motion ?? 'system'}`;
}

export function AccessibilityBootstrap() {
  useLayoutEffect(() => { applyAccessibilityPreferences(readStoredAccessibilityPreferences()); }, []);
  return null;
}

function canUseLocalStorage() {
  try {
    const key = '__nineflow_readiness_probe__';
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function captureCurrentReadinessAssessment(): ReadinessAssessment {
  return assessReadiness({
    width: window.innerWidth,
    height: window.innerHeight,
    online: navigator.onLine,
    storageAvailable: canUseLocalStorage(),
    pointerAvailable: 'PointerEvent' in window || navigator.maxTouchPoints > 0,
    keyboardAvailable: 'onkeydown' in window,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce',
  });
}

function preloadAsset(src: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new window.Image();
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      image.onload = null;
      image.onerror = null;
      if (error) reject(error); else resolve();
    };
    const timeoutId = window.setTimeout(() => finish(new Error(`asset-timeout:${src}`)), ASSET_PRELOAD_TIMEOUT_MS);
    image.onload = () => finish();
    image.onerror = () => finish(new Error(`asset:${src}`));
    image.src = src;
  });
}

function formatCheckedAt(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function ReadinessCenter({
  onClose,
  onChecked,
  gameId,
}: {
  onClose: () => void;
  onChecked?: (summary: SavedReadinessSummary) => void;
  gameId?: GameId;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const runIdRef = useRef(0);
  const onCheckedRef = useRef(onChecked);
  const [assessment, setAssessment] = useState<ReadinessAssessment>(() => captureCurrentReadinessAssessment());
  const [assetStatus, setAssetStatus] = useState<'checking' | 'ready' | 'review'>('checking');
  const [preferences, setPreferences] = useState<AccessibilityPreferences>(readStoredAccessibilityPreferences);
  const [pointerConfirmed, setPointerConfirmed] = useState(false);
  const [keyboardConfirmed, setKeyboardConfirmed] = useState(false);
  const [waitingForKey, setWaitingForKey] = useState(false);
  const [confirmedKey, setConfirmedKey] = useState('');
  const [checkedAt, setCheckedAt] = useState(() => {
    if (typeof window === 'undefined') return '';
    try { return parseSavedReadinessSummary(window.localStorage.getItem(READINESS_STORAGE_KEY))?.checkedAt ?? ''; }
    catch { return ''; }
  });

  const displayedOverall = resolveReadinessOverall(assessment.overall, assetStatus === 'checking' ? 'ready' : assetStatus);

  const runCheck = useCallback(async () => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setAssessment(captureCurrentReadinessAssessment());
    setAssetStatus('checking');
    const settled = await Promise.allSettled(essentialAssetPathsFor(gameId).map(preloadAsset));
    if (runIdRef.current !== runId) return;
    const nextAssetStatus = settled.every((result) => result.status === 'fulfilled') ? 'ready' : 'review';
    setAssetStatus(nextAssetStatus);
    const nextAssessment = captureCurrentReadinessAssessment();
    setAssessment(nextAssessment);
    const overall = resolveReadinessOverall(nextAssessment.overall, nextAssetStatus);
    const summary = { overall, checkedAt: new Date().toISOString(), assetStatus: nextAssetStatus } satisfies SavedReadinessSummary;
    setCheckedAt(summary.checkedAt);
    try { window.localStorage.setItem(READINESS_STORAGE_KEY, JSON.stringify({ version: 1, ...summary })); }
    catch { /* 준비 결과 저장 실패는 위 저장소 항목에서 별도로 안내한다. */ }
    onCheckedRef.current?.(summary);
  }, [gameId]);

  useEffect(() => { onCheckedRef.current = onChecked; }, [onChecked]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(focusFrame);
      runIdRef.current += 1;
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    let resizeTimer: number | null = null;
    const initialFrame = window.requestAnimationFrame(() => { void runCheck(); });
    const refresh = () => { void runCheck(); };
    const refreshViewport = () => {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null;
        setAssessment(captureCurrentReadinessAssessment());
      }, 150);
    };
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    window.addEventListener('resize', refreshViewport);
    return () => {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      window.cancelAnimationFrame(initialFrame);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      window.removeEventListener('resize', refreshViewport);
    };
  }, [runCheck]);

  function updatePreference<Key extends keyof AccessibilityPreferences>(key: Key, value: AccessibilityPreferences[Key]) {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    persistAccessibilityPreferences(next);
    if (key === 'motion') setAssessment(captureCurrentReadinessAssessment());
  }

  function confirmKeyboard(event: ReactKeyboardEvent<HTMLElement>) {
    const isArrowKey = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key);
    const isPrintableKey = event.key.length === 1 && event.key.trim().length === 1;
    if (!waitingForKey || (!isArrowKey && !isPrintableKey)) return;
    event.preventDefault();
    setKeyboardConfirmed(true);
    setWaitingForKey(false);
    setConfirmedKey(event.key === ' ' ? 'Space' : event.key);
  }

  const contextCopy = gameId
    ? '현재 게임을 시작하기 전에 화면·입력·저장 환경을 확인합니다.'
    : '브라우저와 입력 환경을 먼저 확인하면 연습 중단과 기록 손실을 줄일 수 있습니다.';

  return (
    <dialog ref={dialogRef} className="readiness-dialog" aria-labelledby="readiness-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDownCapture={confirmKeyboard}>
      <header>
        <div><span>READINESS CENTER</span><h2 id="readiness-title">응시 준비센터</h2><p>{contextCopy}</p></div>
        <button ref={closeRef} type="button" aria-label="응시 준비센터 닫기" onClick={onClose}>×</button>
      </header>

      <div className="readiness-scroll">
        <section className={`readiness-summary is-${displayedOverall}`} aria-live="polite">
          <span aria-hidden="true">{displayedOverall === 'ready' ? '✓' : displayedOverall === 'review' ? '!' : '×'}</span>
          <div><small>자동 점검 결과</small><b>{assetStatus === 'checking' ? '환경을 확인하고 있습니다…' : readinessLabels[displayedOverall]}</b><p>{displayedOverall === 'ready' ? '필수 환경이 확인되었습니다. 아래 직접 입력 확인까지 마치면 더 안전합니다.' : displayedOverall === 'review' ? '진행할 수 있지만 아래 안내를 확인한 뒤 시작하세요.' : '차단 항목을 해결한 뒤 다시 점검해 주세요.'}</p></div>
          <button type="button" onClick={() => void runCheck()} disabled={assetStatus === 'checking'}>{assetStatus === 'checking' ? '점검 중' : '다시 점검'}</button>
        </section>

        <section className="readiness-checks" aria-labelledby="automatic-check-title">
          <div className="readiness-section-heading"><div><span>01</span><b id="automatic-check-title">자동 환경 점검</b></div><small>화면·온라인 신호·저장·입력 API·모션</small></div>
          <div className="readiness-check-grid">
            {assessment.checks.map((check) => <article key={check.id} className={`is-${check.status}`}><span aria-hidden="true">{check.status === 'ready' ? '✓' : check.status === 'info' ? 'i' : '!'}</span><div><b>{check.label}</b><p>{check.description}</p>{check.status !== 'ready' && <small>{check.remedy}</small>}</div></article>)}
            <article className={`is-${assetStatus === 'ready' ? 'ready' : assetStatus === 'review' ? 'review' : 'info'}`}><span aria-hidden="true">{assetStatus === 'ready' ? '✓' : assetStatus === 'review' ? '!' : '…'}</span><div><b>게임 리소스</b><p>{assetStatus === 'ready' ? '핵심 이미지 리소스를 미리 불러왔습니다.' : assetStatus === 'review' ? '일부 이미지 리소스를 불러오지 못했습니다.' : '핵심 이미지 리소스를 미리 불러오는 중입니다.'}</p>{assetStatus === 'review' && <small>네트워크 연결을 확인하고 다시 점검해 주세요.</small>}</div></article>
          </div>
        </section>

        <section className="readiness-manual" aria-labelledby="manual-check-title">
          <div className="readiness-section-heading"><div><span>02</span><b id="manual-check-title">직접 입력 확인</b></div><small>실제 기기 입력은 한 번 직접 눌러 확인합니다</small></div>
          <div>
            <button type="button" className={pointerConfirmed ? 'is-confirmed' : ''} onClick={() => setPointerConfirmed(true)}><span aria-hidden="true">{pointerConfirmed ? '✓' : '↖'}</span><b>{pointerConfirmed ? '클릭·터치 확인됨' : '여기를 클릭 또는 터치'}</b><small>버튼 선택과 제출에 사용</small></button>
            <button type="button" className={keyboardConfirmed ? 'is-confirmed' : waitingForKey ? 'is-waiting' : ''} onClick={() => setWaitingForKey(true)}><span aria-hidden="true">{keyboardConfirmed ? '✓' : '⌨'}</span><b>{keyboardConfirmed ? `${confirmedKey} 키 확인됨` : waitingForKey ? '아무 문자·방향키를 눌러주세요' : '키보드 입력 확인'}</b><small>방향키·숫자 단축키에 사용</small></button>
          </div>
          <p>직접 입력 확인은 저장되지 않으며 공식 검사 적합성 판정이 아닙니다. 실제 기업 초대 화면의 브라우저·기기 안내가 우선입니다.</p>
        </section>

        <section className="readiness-accessibility" aria-labelledby="accessibility-title">
          <div className="readiness-section-heading"><div><span>03</span><b id="accessibility-title">보기·움직임 설정</b></div><small>현재 브라우저에 저장됩니다</small></div>
          <fieldset><legend>명암</legend><div><button type="button" aria-pressed={preferences.contrast === 'standard'} onClick={() => updatePreference('contrast', 'standard')}>기본 명암</button><button type="button" aria-pressed={preferences.contrast === 'high'} onClick={() => updatePreference('contrast', 'high')}>고대비</button></div></fieldset>
          <fieldset><legend>텍스트</legend><div><button type="button" aria-pressed={preferences.textScale === 'standard'} onClick={() => updatePreference('textScale', 'standard')}>기본 크기</button><button type="button" aria-pressed={preferences.textScale === 'large'} onClick={() => updatePreference('textScale', 'large')}>큰 글자</button></div></fieldset>
          <fieldset><legend>움직임</legend><div><button type="button" aria-pressed={preferences.motion === 'system'} onClick={() => updatePreference('motion', 'system')}>기기 설정</button><button type="button" aria-pressed={preferences.motion === 'reduce'} onClick={() => updatePreference('motion', 'reduce')}>움직임 줄이기</button></div></fieldset>
          <p>접근성 설정은 이 연습 도구의 표시 방식만 바꿉니다. 실제 평가의 편의지원이나 대체 절차는 응시 기관에 별도로 확인하세요.</p>
        </section>
      </div>

      <footer><span>{assetStatus === 'checking' || !checkedAt ? '자동 점검을 마치는 중입니다.' : `${readinessLabels[displayedOverall]} · ${formatCheckedAt(checkedAt)}`}</span><button type="button" onClick={onClose}>설정 저장하고 닫기</button></footer>
    </dialog>
  );
}

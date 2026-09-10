'use client';

import { useEffect, useRef, useState } from 'react';
import type { SessionResult } from '../lib/game-data';
import {
  MAX_PRACTICE_RESULTS_BACKUP_BYTES,
  createPracticeResultsBackup,
  parsePracticeResultsBackup,
} from '../lib/practice-backup';
import {
  LEGACY_RESULTS_STORAGE_KEY,
  LEGACY_V3_RESULTS_STORAGE_KEY,
  RESULTS_GENERATION_KEY,
  RESULTS_STORAGE_PREFIX,
  isResultsGeneration,
  parseResultsEnvelope,
  resultsStorageKey,
} from '../lib/result-envelope';

const RECOVERY_STORAGE_KEYS = [
  'nineflow-practice-results-future-backup',
  'nineflow-practice-results-corrupt-backup',
] as const;

type ImportPreview = {
  exportedAt: string;
  results: SessionResult[];
};

export type DataManagementActionResult = {
  ok: boolean;
  message: string;
};

function backupFilename(now: Date) {
  return `nineflow-practice-backup-${now.toISOString().slice(0, 10)}.json`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function browserHasStoredArtifacts() {
  try {
    const storage = window.localStorage;
    if (storage.getItem(LEGACY_RESULTS_STORAGE_KEY) || storage.getItem(LEGACY_V3_RESULTS_STORAGE_KEY)) return true;
    if (RECOVERY_STORAGE_KEYS.some((key) => Boolean(storage.getItem(key)))) return true;
    const generation = storage.getItem(RESULTS_GENERATION_KEY);
    const activeKey = isResultsGeneration(generation) ? resultsStorageKey(generation) : null;
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(RESULTS_STORAGE_PREFIX)) continue;
      const raw = storage.getItem(key);
      const parsed = parseResultsEnvelope(raw, key === activeKey ? generation : null);
      if (key !== activeKey || !parsed.ok || parsed.envelope.results.length > 0) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function DataManagementDialog({
  results,
  onImport,
  onClear,
  onClose,
}: {
  results: SessionResult[];
  onImport: (imported: SessionResult[]) => DataManagementActionResult;
  onClear: () => DataManagementActionResult;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const clearTriggerRef = useRef<HTMLButtonElement>(null);
  const clearCancelRef = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState('');
  const [noticeTone, setNoticeTone] = useState<'success' | 'error' | 'info'>('info');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [reading, setReading] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [storedArtifactsPresent, setStoredArtifactsPresent] = useState(browserHasStoredArtifacts);
  const hasClearableData = results.length > 0 || storedArtifactsPresent;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(focusFrame);
      if (dialog.open) dialog.close();
    };
  }, []);

  function exportResults() {
    if (!results.length) return;
    try {
      const now = new Date();
      const json = createPracticeResultsBackup(results, now);
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = backupFilename(now);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setNoticeTone('success');
      setNotice(`연습 기록 ${results.length}개를 JSON 파일로 내보냈습니다.`);
    } catch {
      setNoticeTone('error');
      setNotice('백업 파일을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }

  async function readBackupFile(file: File | undefined) {
    setPreview(null);
    if (!file) return;
    setReading(true);
    setNotice('');
    try {
      if (file.size > MAX_PRACTICE_RESULTS_BACKUP_BYTES) {
        setNoticeTone('error');
        setNotice('백업 파일은 5MB 이하만 가져올 수 있습니다. 파일 전체를 가져오지 않았습니다.');
        return;
      }
      const parsed = parsePracticeResultsBackup(await file.text());
      if (!parsed.ok) {
        setNoticeTone('error');
        setNotice(parsed.message);
        return;
      }
      setPreview({ exportedAt: parsed.exportedAt, results: parsed.results });
      setNoticeTone('info');
      setNotice(`검증 완료: ${parsed.results.length}개 기록을 기존 기록과 합칠 준비가 됐습니다.`);
    } catch {
      setNoticeTone('error');
      setNotice('파일을 읽지 못했습니다. 5MB 이하의 NineFlow JSON 백업을 선택해 주세요.');
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function importPreview() {
    if (!preview) return;
    const outcome = onImport(preview.results);
    setNoticeTone(outcome.ok ? 'success' : 'error');
    setNotice(outcome.message);
    if (outcome.ok) setPreview(null);
  }

  function clearResults() {
    const outcome = onClear();
    setNoticeTone(outcome.ok ? 'success' : 'error');
    setNotice(outcome.message);
    if (outcome.ok) {
      setConfirmClear(false);
      setPreview(null);
      setStoredArtifactsPresent(browserHasStoredArtifacts());
      window.requestAnimationFrame(() => closeRef.current?.focus());
    } else {
      window.requestAnimationFrame(() => clearCancelRef.current?.focus());
    }
  }

  function showClearConfirmation() {
    setConfirmClear(true);
    window.requestAnimationFrame(() => clearCancelRef.current?.focus());
  }

  function cancelClear() {
    setConfirmClear(false);
    window.requestAnimationFrame(() => clearTriggerRef.current?.focus());
  }

  return (
    <dialog ref={dialogRef} className="data-dialog" aria-labelledby="data-dialog-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <header><div><span>LOCAL DATA</span><h2 id="data-dialog-title">내 기록 백업·복원</h2><p>로그인 없이 브라우저에 저장된 연습 기록을 직접 관리합니다.</p></div><button ref={closeRef} type="button" aria-label="내 기록 백업·복원 닫기" onClick={onClose}>×</button></header>
      <div className="data-dialog-scroll">
        <aside className="data-privacy-note"><span aria-hidden="true">i</span><div><b>서버로 전송하지 않습니다.</b><p>내보내기와 가져오기는 이 기기 안에서 처리됩니다. 브라우저 데이터 삭제 전에는 JSON 백업을 받아두세요.</p></div></aside>

        <section className="data-action-card" aria-labelledby="export-title">
          <div className="data-action-number">01</div>
          <div><h3 id="export-title">기록 내보내기</h3><p>현재 저장된 점수·세부 설정·문항별 복습을 버전이 있는 JSON 한 파일로 저장합니다.</p><small>현재 기록 {results.length}개 · 개인 식별정보는 별도로 수집하지 않습니다.</small></div>
          <button type="button" disabled={!results.length} onClick={exportResults}>{results.length ? 'JSON 백업 받기' : '내보낼 기록 없음'}</button>
        </section>

        <section className="data-action-card data-import-card" aria-labelledby="import-title">
          <div className="data-action-number">02</div>
          <div><h3 id="import-title">기록 가져오기</h3><p>파일 전체와 복습 버전을 먼저 검증한 뒤, 현재 기록을 지우지 않고 중복 ID를 제외해 합칩니다.</p><small>부분 가져오기는 하지 않습니다. 한 항목이라도 손상되면 파일 전체를 거절합니다.</small></div>
          <label className={reading ? 'is-reading' : ''}><input ref={fileRef} type="file" accept="application/json,.json" disabled={reading} onChange={(event) => void readBackupFile(event.target.files?.[0])} /><span>{reading ? '파일 확인 중…' : 'JSON 파일 선택'}</span></label>
          {preview && <aside className="data-import-preview" role="status"><div><span>검증 완료</span><b>{preview.results.length}개 기록</b><small>{formatDate(preview.exportedAt)} 백업</small></div><button type="button" onClick={importPreview}>기존 기록과 합치기</button><button type="button" className="data-preview-cancel" onClick={() => { setPreview(null); setNotice(''); }}>취소</button></aside>}
        </section>

        <section className="data-action-card data-clear-card" aria-labelledby="clear-title">
          <div className="data-action-number">03</div>
          <div><h3 id="clear-title">이 브라우저 기록 삭제</h3><p>연습 결과와 문항별 복습만 삭제합니다. 게임 설정과 접근성 설정은 유지합니다.</p><small>삭제 후에는 JSON 백업이 없으면 복구할 수 없습니다.</small></div>
          {!confirmClear
            ? <button ref={clearTriggerRef} type="button" className="data-clear-trigger" disabled={!hasClearableData} onClick={showClearConfirmation}>{results.length ? '전체 기록 삭제' : storedArtifactsPresent ? '저장 데이터 삭제' : '삭제할 기록 없음'}</button>
            : <div className="data-clear-confirm" role="alert"><b>{results.length ? `${results.length}개 기록을 삭제할까요?` : '저장된 복구·호환 기록을 삭제할까요?'}</b><span><button ref={clearCancelRef} type="button" onClick={cancelClear}>취소</button><button type="button" onClick={clearResults}>삭제 확정</button></span></div>}
        </section>

        {notice && <p className={`data-dialog-notice is-${noticeTone}`} role="status" aria-live="polite">{notice}</p>}
      </div>
      <footer><span>백업 포맷 v1 · 최대 5MB · 기존 기록과 병합</span><button type="button" onClick={onClose}>닫기</button></footer>
    </dialog>
  );
}

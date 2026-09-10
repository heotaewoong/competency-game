export type AccessibilityPreferences = {
  contrast: 'standard' | 'high';
  textScale: 'standard' | 'large';
  motion: 'system' | 'reduce';
};

export const DEFAULT_ACCESSIBILITY_PREFERENCES: Readonly<AccessibilityPreferences> = Object.freeze({
  contrast: 'standard',
  textScale: 'standard',
  motion: 'system',
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Converts persisted or user-provided data into a complete, supported preference
 * object. Unknown fields and invalid values are intentionally ignored so a
 * legacy/corrupted snapshot cannot enable an option unexpectedly.
 */
export function normalizeAccessibilityPreferences(value: unknown): AccessibilityPreferences {
  if (!isPlainObject(value)) return { ...DEFAULT_ACCESSIBILITY_PREFERENCES };

  return {
    contrast: value.contrast === 'high' ? 'high' : 'standard',
    textScale: value.textScale === 'large' ? 'large' : 'standard',
    motion: value.motion === 'reduce' ? 'reduce' : 'system',
  };
}

/** Safely restores preferences from local storage JSON. */
export function parseAccessibilityPreferences(raw: string | null | undefined): AccessibilityPreferences {
  if (!raw) return { ...DEFAULT_ACCESSIBILITY_PREFERENCES };

  try {
    return normalizeAccessibilityPreferences(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_ACCESSIBILITY_PREFERENCES };
  }
}

/** Produces a canonical, self-healing JSON snapshot for local storage. */
export function serializeAccessibilityPreferences(value: unknown): string {
  return JSON.stringify(normalizeAccessibilityPreferences(value));
}

export type ReadinessSnapshot = {
  width: number;
  height: number;
  online: boolean;
  storageAvailable: boolean;
  pointerAvailable: boolean;
  keyboardAvailable: boolean;
  reducedMotion: boolean;
};

export type ReadinessOverall = 'ready' | 'review' | 'blocked';
export type ReadinessAssetStatus = 'ready' | 'review';
export type ReadinessCheckStatus = ReadinessOverall | 'info';
export type ReadinessCheckId = 'viewport' | 'network' | 'storage' | 'input' | 'motion';

export type ReadinessCheck = {
  id: ReadinessCheckId;
  status: ReadinessCheckStatus;
  label: string;
  description: string;
  remedy: string;
};

export type ReadinessAssessment = {
  overall: ReadinessOverall;
  checks: ReadinessCheck[];
};

/**
 * Combines a live environment assessment with the result of the last completed
 * essential-asset check. Environment failures may recover as the browser state
 * changes, while an asset failure remains reviewable until assets are checked
 * successfully again.
 */
export function resolveReadinessOverall(
  environmentOverall: ReadinessOverall,
  assetStatus: ReadinessAssetStatus,
): ReadinessOverall {
  if (environmentOverall === 'blocked') return 'blocked';
  if (environmentOverall === 'review' || assetStatus === 'review') return 'review';
  return 'ready';
}

function assessViewport(width: number, height: number): ReadinessCheck {
  const validSize = Number.isFinite(width) && Number.isFinite(height) && width >= 320 && height >= 320;

  if (!validSize) {
    return {
      id: 'viewport',
      status: 'blocked',
      label: '화면 크기',
      description: '게임을 진행하기에는 화면이 너무 작습니다. 가로와 세로 모두 320px 이상이어야 합니다.',
      remedy: '창을 넓히거나 화면이 더 큰 기기로 다시 접속해 주세요.',
    };
  }

  return {
    id: 'viewport',
    status: 'ready',
    label: '화면 크기',
    description: `현재 화면 ${Math.round(width)}×${Math.round(height)}px에서 게임을 진행할 수 있습니다.`,
    remedy: '추가 조치가 필요하지 않습니다.',
  };
}

function assessNetwork(online: boolean): ReadinessCheck {
  if (!online) {
    return {
      id: 'network',
      status: 'review',
      label: '브라우저 온라인 신호',
      description: '브라우저가 오프라인 상태로 보고합니다. 이미 열린 연습은 동작할 수 있지만 페이지 이동이 불안정할 수 있습니다.',
      remedy: '안정적인 인터넷 연결을 확인한 뒤 시작해 주세요.',
    };
  }

  return {
    id: 'network',
    status: 'ready',
    label: '브라우저 온라인 신호',
    description: '브라우저가 온라인 상태로 보고합니다. 이 신호만으로 실제 인터넷 도달성을 보장하지는 않습니다.',
    remedy: '게임 리소스 사전 불러오기 결과와 실제 기업 응시 페이지 연결도 함께 확인해 주세요.',
  };
}

function assessStorage(storageAvailable: boolean): ReadinessCheck {
  if (!storageAvailable) {
    return {
      id: 'storage',
      status: 'review',
      label: '기록 저장',
      description: '이 브라우저에서는 연습 기록과 환경설정을 저장하지 못할 수 있습니다.',
      remedy: '시크릿 모드를 종료하거나 브라우저의 사이트 저장소 사용을 허용해 주세요.',
    };
  }

  return {
    id: 'storage',
    status: 'ready',
    label: '기록 저장',
    description: '연습 기록과 환경설정을 이 기기에 저장할 수 있습니다.',
    remedy: '추가 조치가 필요하지 않습니다.',
  };
}

function assessInput(pointerAvailable: boolean, keyboardAvailable: boolean): ReadinessCheck {
  if (!pointerAvailable && !keyboardAvailable) {
    return {
      id: 'input',
      status: 'blocked',
      label: '입력 장치',
      description: '사용 가능한 포인터 또는 키보드를 확인하지 못했습니다.',
      remedy: '마우스·터치 입력 또는 키보드 중 하나를 연결하고 다시 확인해 주세요.',
    };
  }

  const availableInputs = [pointerAvailable ? '마우스·터치' : '', keyboardAvailable ? '키보드' : '']
    .filter(Boolean)
    .join(', ');

  return {
    id: 'input',
    status: 'ready',
    label: '입력 장치',
    description: `${availableInputs} 입력을 사용할 수 있습니다.`,
    remedy: '추가 조치가 필요하지 않습니다.',
  };
}

function assessMotion(reducedMotion: boolean): ReadinessCheck {
  if (reducedMotion) {
    return {
      id: 'motion',
      status: 'info',
      label: '모션 설정',
      description: '움직임 줄이기 설정을 감지했습니다. 전환 효과를 줄인 화면으로 진행합니다.',
      remedy: '현재 설정을 유지해도 게임 진행과 기록에는 영향이 없습니다.',
    };
  }

  return {
    id: 'motion',
    status: 'ready',
    label: '모션 설정',
    description: '시스템의 기본 모션 설정을 사용합니다.',
    remedy: '움직임이 불편하면 준비센터에서 움직임 줄이기를 선택해 주세요.',
  };
}

/**
 * Creates a deterministic pre-flight assessment. Informational checks never
 * lower the overall state; a blocked check always takes priority over review.
 */
export function assessReadiness(snapshot: ReadinessSnapshot): ReadinessAssessment {
  const checks = [
    assessViewport(snapshot.width, snapshot.height),
    assessNetwork(snapshot.online),
    assessStorage(snapshot.storageAvailable),
    assessInput(snapshot.pointerAvailable, snapshot.keyboardAvailable),
    assessMotion(snapshot.reducedMotion),
  ];

  const overall: ReadinessOverall = checks.some((check) => check.status === 'blocked')
    ? 'blocked'
    : checks.some((check) => check.status === 'review')
      ? 'review'
      : 'ready';

  return { overall, checks };
}

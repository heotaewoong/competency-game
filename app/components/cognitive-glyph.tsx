'use client';

import { useEffect, useRef } from 'react';

type CognitiveGlyphProps = {
  variant: number;
  size?: number;
  color?: string;
  rotate?: number;
  mirrored?: boolean;
  label?: string;
  className?: string;
};

const TAU = Math.PI * 2;

// 사용자가 지정한 5×3 기억표의 기본 한 글자 암기명.
export const glyphDefaultMnemonics = ['세','원','네','네','원','다','네','원','별','네','세','피','세','꽃','네'] as const;

// 공식 명칭을 뜻하지 않는, 모양을 구분하기 위한 설명형 이름.
export const glyphShapeNames = [
  '삼각형','원','정사각형','사다리꼴','모래시계',
  '오각형','마름모','나비형','별','겹사각형',
  '쌍삼각형','계단형','맞댄삼각형','네잎꽃','지그재그',
] as const;

function polygon(ctx: CanvasRenderingContext2D, points: Array<[number, number]>) {
  ctx.beginPath();
  points.forEach(([x, y], index) => { if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.closePath();
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, count = 5) {
  ctx.beginPath();
  for (let index = 0; index < count * 2; index += 1) {
    const radius = index % 2 ? inner : outer;
    const angle = -Math.PI / 2 + (index * Math.PI) / count;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function drawGlyph(ctx: CanvasRenderingContext2D, variant: number, color: string) {
  ctx.fillStyle = color;
  ctx.lineJoin = 'round';
  const fill = () => ctx.fill();
  const normalized = ((variant % 15) + 15) % 15;

  if (normalized === 0) {
    polygon(ctx, [[50,12],[88,82],[12,82]]); fill();
  } else if (normalized === 1) {
    ctx.beginPath(); ctx.arc(50,50,37,0,TAU); fill();
  } else if (normalized === 2) {
    ctx.fillRect(16,16,68,68);
  } else if (normalized === 3) {
    polygon(ctx, [[27,16],[73,16],[87,84],[13,84]]); fill();
  } else if (normalized === 4) {
    ctx.beginPath(); ctx.moveTo(16,16); ctx.lineTo(84,16); ctx.arc(50,16,34,0,Math.PI); ctx.closePath(); fill();
    ctx.beginPath(); ctx.moveTo(16,84); ctx.lineTo(84,84); ctx.arc(50,84,34,Math.PI,TAU); ctx.closePath(); fill();
  } else if (normalized === 5) {
    polygon(ctx, [[30,16],[70,16],[86,48],[50,88],[14,48]]); fill();
  } else if (normalized === 6) {
    polygon(ctx, [[50,10],[90,50],[50,90],[10,50]]); fill();
  } else if (normalized === 7) {
    ctx.beginPath(); ctx.moveTo(50,50); ctx.arc(50,50,36,Math.PI/2,Math.PI*1.5); ctx.closePath(); fill();
    ctx.beginPath(); ctx.moveTo(50,50); ctx.arc(50,50,36,-Math.PI/2,Math.PI/2); ctx.closePath(); fill();
  } else if (normalized === 8) {
    star(ctx,50,50,42,18,5); fill();
  } else if (normalized === 9) {
    ctx.fillRect(12,14,43,43); ctx.fillRect(45,47,43,43);
  } else if (normalized === 10) {
    polygon(ctx, [[12,16],[47,16],[36,88]]); fill(); polygon(ctx, [[53,16],[88,16],[64,88]]); fill();
  } else if (normalized === 11) {
    polygon(ctx, [[10,88],[10,70],[23,70],[23,52],[35,52],[35,34],[43,34],[43,16],[57,16],[57,34],[65,34],[65,52],[77,52],[77,70],[90,70],[90,88]]); fill();
  } else if (normalized === 12) {
    polygon(ctx, [[12,47],[50,12],[88,47]]); fill(); polygon(ctx, [[12,53],[88,53],[50,88]]); fill();
  } else if (normalized === 13) {
    ctx.save(); ctx.translate(50,50);
    for (let index=0; index<4; index+=1) { ctx.rotate(Math.PI/2); ctx.beginPath(); ctx.ellipse(0,-23,13,31,0,0,TAU); fill(); }
    ctx.restore();
  } else {
    polygon(ctx, [[10,20],[24,10],[38,35],[51,10],[64,35],[78,10],[91,20],[78,88],[64,63],[51,88],[38,63],[24,88]]); fill();
  }
}

export function CognitiveGlyph({ variant, size = 92, color = '#5572e8', rotate = 0, mirrored = false, label = '기하 도형', className = '' }: CognitiveGlyphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * ratio;
    canvas.height = size * ratio;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.translate(size / 2, size / 2);
    ctx.scale((size / 100) * (mirrored ? -1 : 1), size / 100);
    ctx.rotate((rotate * Math.PI) / 180);
    ctx.translate(-50, -50);
    drawGlyph(ctx, variant, color);
  }, [color, mirrored, rotate, size, variant]);

  return <canvas ref={canvasRef} className={`cognitive-glyph ${className}`} role="img" aria-label={label} />;
}

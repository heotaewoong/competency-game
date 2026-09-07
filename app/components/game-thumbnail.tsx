import { CognitiveGlyph } from './cognitive-glyph';
import type { GameId } from '../lib/game-data';
import Image from 'next/image';

const tilePattern = [1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1];

function TileGrid({ rotated = false }: { rotated?: boolean }) {
  return (
    <div className={`mini-tile-grid ${rotated ? 'rotated' : ''}`}>
      {tilePattern.map((filled, index) => <i className={filled ? 'filled' : ''} key={index} />)}
    </div>
  );
}

export function GameThumbnail({ gameId }: { gameId: GameId }) {
  if (gameId === 'rotation') return <div className="thumb-scene rotation-thumb" aria-hidden="true"><TileGrid /><b>→</b><TileGrid rotated /></div>;
  if (gameId === 'rps') return <div className="thumb-scene rps-thumb" aria-hidden="true"><Image src="/assets/rps/rock.svg" alt="" width={72} height={72} /><b>VS</b><span>?</span></div>;
  if (gameId === 'appointment') return <div className="thumb-scene appointment-thumb" aria-hidden="true"><span><b>영희</b><i>월</i><i>수</i><i>금</i></span><span><b>철수</b><i>화</i><i>수</i><i>토</i></span><span><b>미미</b><i>수</i><i>금</i><i>일</i></span></div>;
  if (gameId === 'path') return <div className="thumb-scene path-thumb" aria-hidden="true"><span className="mini-vehicle">🚗</span><div className="mini-path-grid">{Array.from({ length: 25 }, (_, index) => <i className={index === 16 ? 'fence slash' : index === 8 ? 'fence backslash' : ''} key={index} />)}</div><span className="mini-person">●</span></div>;
  if (gameId === 'potion') return <div className="thumb-scene potion-thumb" aria-hidden="true"><i className="leaf-a" /><i className="leaf-b" /><span>＋</span><b><small>BLUE</small></b></div>;
  if (gameId === 'nback') return <div className="thumb-scene nback-thumb" aria-hidden="true"><CognitiveGlyph variant={3} size={66} color="#2a9fb8" /><span>…</span><CognitiveGlyph variant={3} size={66} color="#2a9fb8" /><b>2-back</b></div>;
  if (gameId === 'number') return <div className="thumb-scene number-thumb" aria-hidden="true">{[9, 3, 6, 5, 1, 8, 2, 7, 4].map((value) => <i key={value}>{value}</i>)}</div>;
  if (gameId === 'count') return <div className="thumb-scene count-thumb" aria-hidden="true"><div>{Array.from({ length: 14 }, (_, index) => <i key={index}>집중</i>)}</div><span /><div>{Array.from({ length: 18 }, (_, index) => <i key={index}>속도</i>)}</div></div>;
  return <div className="thumb-scene mouse-thumb" aria-hidden="true"><div className="mini-mouse-grid">{Array.from({ length: 36 }, (_, index) => <i className={[2, 8, 13, 20, 27, 34].includes(index) ? 'mouse' : index === 17 ? 'tracker-r' : ''} key={index}>{index === 17 ? 'R' : ''}</i>)}</div></div>;
}

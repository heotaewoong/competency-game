import { PotionFlask, PotionIngredientGlyph } from './potion-visuals';
import { CatMarker, MouseMarker } from './mouse-visuals';
import { NBackThumbnailVisual } from './nback-visuals';
import type { GameId } from '../lib/game-data';
import { POTION_INGREDIENTS } from '../lib/potion-game';
import Image from 'next/image';

const tilePattern = [1,0,0,0,1, 1,1,0,1,0, 0,1,1,0,0, 1,0,1,0,1, 0,0,0,1,0];

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
  if (gameId === 'potion') return (
    <div className="thumb-scene potion-thumb" aria-hidden="true">
      <div className="potion-thumb-ingredients">
        {POTION_INGREDIENTS.map((ingredient, index) => <span key={ingredient.id}><PotionIngredientGlyph ingredientIndex={index} /><b>{ingredient.code}</b></span>)}
      </div>
      <span className="potion-thumb-flow"><b>14</b><small>조합</small><i>→</i></span>
      <div className="potion-thumb-results">
        <span><PotionFlask outcome="blue" compact /><b>파랑</b></span>
        <span><PotionFlask outcome="red" compact /><b>빨강</b></span>
      </div>
    </div>
  );
  if (gameId === 'nback') return <div className="thumb-scene nback-thumb" aria-hidden="true"><NBackThumbnailVisual /></div>;
  if (gameId === 'number') return <div className="thumb-scene number-thumb" aria-hidden="true">{[9, 3, 6, 5, 1, 8, 2, 7, 4].map((value) => <i key={value}>{value}</i>)}</div>;
  if (gameId === 'count') return <div className="thumb-scene count-thumb" aria-hidden="true"><div>{Array.from({ length: 14 }, (_, index) => <i key={index}>집중</i>)}</div><span /><div>{Array.from({ length: 18 }, (_, index) => <i key={index}>속도</i>)}</div></div>;
  if (gameId === 'mouse') return (
    <div className="thumb-scene mouse-thumb" aria-hidden="true">
      <div className="mouse-thumb-grid">{Array.from({ length: 36 }, (_, index) => <i key={index} />)}</div>
      <div className="mouse-thumb-actors">
        <span className="mouse-thumb-card mouse-card"><MouseMarker size="compact" /><b>기억</b></span>
        <i className="mouse-thumb-arrow">→</i>
        <span className="mouse-thumb-card red-card"><CatMarker tone="red" size="compact" /><b>빨강</b></span>
        <span className="mouse-thumb-card blue-card"><CatMarker tone="blue" size="compact" /><b>파랑</b></span>
      </div>
    </div>
  );
  return null;
}

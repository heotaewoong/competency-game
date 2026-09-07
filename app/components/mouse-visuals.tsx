export type CatTone = 'neutral' | 'red' | 'blue';
export type AnimalMarkerSize = 'compact' | 'board' | 'hero' | 'review';

type CatMarkerProps = {
  tone?: CatTone;
  size?: AnimalMarkerSize;
};

type MouseMarkerProps = {
  size?: AnimalMarkerSize;
};

export function CatMarker({ tone = 'neutral', size = 'board' }: CatMarkerProps) {
  return (
    <span className={`animal-marker cat-marker is-${tone} size-${size}`} aria-hidden="true">
      <span className="animal-card">
        <span className="cat-face">
          <span className="cat-blaze" />
          <span className="cat-eye cat-eye-left" />
          <span className="cat-eye cat-eye-right" />
          <span className="cat-muzzle" />
          <span className="cat-nose" />
          <span className="cat-whisker cat-whisker-left" />
          <span className="cat-whisker cat-whisker-right" />
        </span>
      </span>
      {tone !== 'neutral' ? <small className="animal-code">{tone === 'red' ? 'R' : 'B'}</small> : null}
    </span>
  );
}

export function MouseMarker({ size = 'board' }: MouseMarkerProps) {
  return (
    <span className={`animal-marker mouse-marker size-${size}`} aria-hidden="true">
      <span className="animal-card">
        <span className="mouse-face">
          <span className="mouse-ear mouse-ear-left" />
          <span className="mouse-ear mouse-ear-right" />
          <span className="mouse-eye mouse-eye-left" />
          <span className="mouse-eye mouse-eye-right" />
          <span className="mouse-nose" />
          <span className="mouse-whisker mouse-whisker-left" />
          <span className="mouse-whisker mouse-whisker-right" />
        </span>
      </span>
    </span>
  );
}

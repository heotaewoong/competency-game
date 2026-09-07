import { POTION_INGREDIENTS, type PotionOutcome } from '../lib/potion-game';

export function PotionIngredientGlyph({ ingredientIndex }: { ingredientIndex: number }) {
  const ingredient = POTION_INGREDIENTS[ingredientIndex];
  return (
    <span className={`potion-ingredient-glyph kind-${ingredient.id}`} aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  );
}

export function PotionFlask({ outcome, compact = false }: { outcome: PotionOutcome; compact?: boolean }) {
  return (
    <span className={`potion-flask ${outcome} ${compact ? 'is-compact' : ''}`} aria-hidden="true">
      <i className="potion-flask-neck" />
      <i className="potion-flask-body"><span /></i>
    </span>
  );
}

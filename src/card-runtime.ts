import type { Card, Doc, Level, LevelKey } from './types.ts';

export interface RuntimeAddition {
  targetLevel: Level | undefined;
  storedCard: Card | undefined;
  isNew: boolean;
}

/** 저장 전·후 문헌을 비교해 새 카드의 런타임 레벨과 세션 반영 여부를 찾는다. */
export function resolveRuntimeAddition(
  previousDoc: Doc, refreshedDoc: Doc, type: LevelKey, cardId: string,
): RuntimeAddition {
  const alreadyLoaded = previousDoc.levels
    .find(level => level.key === type)?.cards.some(card => card.id === cardId) ?? false;
  const targetLevel = refreshedDoc.levels.find(level => level.key === type);
  return {
    targetLevel,
    storedCard: targetLevel?.cards.find(card => card.id === cardId),
    isNew: !alreadyLoaded,
  };
}

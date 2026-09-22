// Adapted from ibelick/mesurer (MIT). See THIRD_PARTY_LICENSES.md.
import { ANCESTOR_KEEP_COVERAGE, ANCESTOR_PRUNE_SCALE, MIN_MULTI_ELEMENT_COVERAGE, MIN_SINGLE_ELEMENT_COVERAGE, MIN_SINGLE_TARGET_SIZE } from "./constants";
import { getDistanceToRect, intersectionArea, rectArea } from "./geometry";
import type { Point, Rect } from "./types";

type MultiCandidate = { element: Element; rect: Rect; overlapArea: number; elementCoverage: number };

export const pickMultiTargets = (selectionRect: Rect, items: Array<{ element: Element; rect: Rect }>) => {
  const candidates: MultiCandidate[] = [];

  for (const { element, rect } of items) {
    const overlapArea = intersectionArea(selectionRect, rect);
    const elementArea = Math.max(1, rectArea(rect));
    const elementCoverage = overlapArea / elementArea;

    if (overlapArea > 0 && elementCoverage >= MIN_MULTI_ELEMENT_COVERAGE) {
      candidates.push({ element, rect, overlapArea, elementCoverage });
    }
  }

  const pruned = candidates.filter((candidate, index) => !candidates.some((other, otherIndex) => {
    if (index === otherIndex) return false;
    const candidateArea = rectArea(candidate.rect);
    const otherArea = rectArea(other.rect);

    const isAncestorLike = candidateArea > otherArea * ANCESTOR_PRUNE_SCALE
      && candidate.rect.left <= other.rect.left
      && candidate.rect.top <= other.rect.top
      && candidate.rect.left + candidate.rect.width >= other.rect.left + other.rect.width
      && candidate.rect.top + candidate.rect.height >= other.rect.top + other.rect.height;

    return isAncestorLike && candidate.elementCoverage < ANCESTOR_KEEP_COVERAGE;
  }));

  return (pruned.length > 0 ? pruned : candidates)
    .sort((a, b) => rectArea(a.rect) - rectArea(b.rect))
    .map(({ element }) => element);
};

export const pickSingleTarget = (selectionRect: Rect, point: Point, items: Array<{ element: Element; rect: Rect }>) => {
  const selectionArea = Math.max(1, rectArea(selectionRect));
  const scored: Array<{ element: Element; rect: Rect; coverage: number; score: number }> = [];

  for (const { element, rect } of items) {
    const overlap = intersectionArea(selectionRect, rect);
    const elementArea = Math.max(1, rectArea(rect));
    const coverage = overlap / elementArea;

    if (
      rect.width < MIN_SINGLE_TARGET_SIZE
      || rect.height < MIN_SINGLE_TARGET_SIZE
      || coverage < MIN_SINGLE_ELEMENT_COVERAGE
    ) {
      continue;
    }

    const areaRatio = elementArea / selectionArea;
    const areaSimilarity = 1 - Math.min(1, Math.abs(Math.log(areaRatio)) / 2);

    const pointerInside = point.x >= rect.left
      && point.x <= rect.left + rect.width
      && point.y >= rect.top
      && point.y <= rect.top + rect.height;

    const largeContainerPenalty = elementArea > selectionArea * 4 && coverage < 0.9 ? 0.25 : 0;

    scored.push({
      element,
      rect,
      coverage,
      score: coverage * 0.55 + areaSimilarity * 0.35 + (pointerInside ? 0.2 : 0) - largeContainerPenalty,
    });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);

  return scored[0].element;
};

export const pickPointTarget = (point: Point, items: Array<{ element: Element; rect: Rect }>) => {
  const scored: Array<{ element: Element; score: number }> = [];

  for (const { element, rect } of items) {
    if (rect.width < MIN_SINGLE_TARGET_SIZE || rect.height < MIN_SINGLE_TARGET_SIZE) continue;

    const area = Math.max(1, rectArea(rect));

    const inside = point.x >= rect.left
      && point.x <= rect.left + rect.width
      && point.y >= rect.top
      && point.y <= rect.top + rect.height;

    const distance = getDistanceToRect(point, rect);
    const proximity = 1 / (1 + distance);
    const areaWeight = 1 / (1 + Math.log(area));

    scored.push({ element, score: (inside ? 2 : 0) + proximity * 0.9 + areaWeight * 0.35 });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);

  return scored[0].element;
};

import { describe, it, expect } from 'vitest';
import { ScoreCalculator } from '../../src/core/score';
import type { EliminationEvent, GameConfig } from '../../src/types';
import { createConfig } from '../../src/core/config';

function makeElimination(
  reason: 'full_same_type' | 'empty',
  glassType: number = 0,
  glassCount: number = 6,
): EliminationEvent {
  return {
    position: { row: 0, col: 0 },
    plate: {
      id: 'test',
      glasses: Array(glassCount).fill(glassType),
      placedTimestamp: 1,
    },
    reason,
  };
}

describe('ScoreCalculator', () => {
  const calc = new ScoreCalculator();

  describe('calculateEliminationScore', () => {
    it('returns 0 for empty plate elimination', () => {
      const event = makeElimination('empty', 0, 0);
      expect(calc.calculateEliminationScore(event, 1, [0, 1])).toBe(0);
    });

    it('returns comboIndex for full_same_type elimination', () => {
      const event = makeElimination('full_same_type', 3);
      // type 3 is NOT in targetGlasses [0, 1]
      expect(calc.calculateEliminationScore(event, 1, [0, 1])).toBe(1);
      expect(calc.calculateEliminationScore(event, 3, [0, 1])).toBe(3);
      expect(calc.calculateEliminationScore(event, 5, [0, 1])).toBe(5);
    });

    it('doubles score when glass type is a target glass', () => {
      const event = makeElimination('full_same_type', 2);
      expect(calc.calculateEliminationScore(event, 1, [2, 5])).toBe(2);
      expect(calc.calculateEliminationScore(event, 3, [2, 5])).toBe(6);
    });

    it('does not double when glass type is not a target glass', () => {
      const event = makeElimination('full_same_type', 4);
      expect(calc.calculateEliminationScore(event, 2, [0, 1])).toBe(2);
    });

    it('handles empty targetGlasses array', () => {
      const event = makeElimination('full_same_type', 0);
      expect(calc.calculateEliminationScore(event, 1, [])).toBe(1);
    });
  });

  describe('calculateRoundBonus', () => {
    const config = createConfig();

    it('returns 0 when no thresholds are reached', () => {
      expect(calc.calculateRoundBonus(0, config)).toBe(0);
      expect(calc.calculateRoundBonus(2, config)).toBe(0);
    });

    it('returns bonus for first threshold (3 eliminations → +1)', () => {
      expect(calc.calculateRoundBonus(3, config)).toBe(1);
    });

    it('sums bonuses for multiple reached thresholds', () => {
      // default: [{3,1},{6,5},{9,10}]
      expect(calc.calculateRoundBonus(6, config)).toBe(1 + 5);
      expect(calc.calculateRoundBonus(7, config)).toBe(1 + 5);
      expect(calc.calculateRoundBonus(9, config)).toBe(1 + 5 + 10);
      expect(calc.calculateRoundBonus(100, config)).toBe(1 + 5 + 10);
    });

    it('works with custom bonus config', () => {
      const customConfig = createConfig({
        roundBonuses: [
          { threshold: 2, bonus: 3 },
          { threshold: 5, bonus: 7 },
        ],
      });
      expect(calc.calculateRoundBonus(1, customConfig)).toBe(0);
      expect(calc.calculateRoundBonus(2, customConfig)).toBe(3);
      expect(calc.calculateRoundBonus(5, customConfig)).toBe(3 + 7);
    });

    it('returns 0 when roundBonuses is empty', () => {
      const emptyConfig = createConfig({ roundBonuses: [] });
      expect(calc.calculateRoundBonus(10, emptyConfig)).toBe(0);
    });
  });
});

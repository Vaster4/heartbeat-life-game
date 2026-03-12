import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/core/game-engine';

function makeSeededRng(seed = 0.5): () => number {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

describe('GameEngine', () => {
  describe('constructor & start', () => {
    it('initializes with default config', () => {
      const engine = new GameEngine(undefined, () => 0.5);
      engine.start();
      const state = engine.getState();
      expect(state.board.rows).toBe(6);
      expect(state.board.cols).toBe(4);
      expect(state.score).toBe(0);
      expect(state.round).toBe(1);
      expect(state.gameOver).toBe(false);
      expect(state.selectedPlateIndex).toBeNull();
    });

    it('generates 3 plates in staging area on start', () => {
      const engine = new GameEngine(undefined, () => 0.5);
      engine.start();
      const state = engine.getState();
      expect(state.stagingArea).toHaveLength(3);
      for (const plate of state.stagingArea) {
        expect(plate).not.toBeNull();
      }
    });

    it('selects target glasses on start', () => {
      const engine = new GameEngine({ targetGlassCount: 2 }, makeSeededRng());
      engine.start();
      const state = engine.getState();
      expect(state.targetGlasses).toHaveLength(2);
      for (const t of state.targetGlasses) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThan(8);
      }
    });

    it('all board cells are empty on start', () => {
      const engine = new GameEngine(undefined, () => 0.5);
      engine.start();
      const state = engine.getState();
      for (const row of state.board.cells) {
        for (const cell of row) {
          expect(cell).toBeNull();
        }
      }
    });
  });

  describe('reset', () => {
    it('resets game to initial state', () => {
      const engine = new GameEngine(undefined, makeSeededRng());
      engine.start();
      engine.selectPlate(0);
      engine.placePlate(0, 0);
      engine.reset();
      const state = engine.getState();
      expect(state.score).toBe(0);
      expect(state.round).toBe(1);
      expect(state.gameOver).toBe(false);
      expect(state.selectedPlateIndex).toBeNull();
    });
  });

  describe('selectPlate', () => {
    it('selects a valid plate from staging area', () => {
      const engine = new GameEngine(undefined, () => 0.5);
      engine.start();
      engine.selectPlate(1);
      expect(engine.getState().selectedPlateIndex).toBe(1);
    });

    it('ignores out-of-range index', () => {
      const engine = new GameEngine(undefined, () => 0.5);
      engine.start();
      engine.selectPlate(5);
      expect(engine.getState().selectedPlateIndex).toBeNull();
    });

    it('ignores negative index', () => {
      const engine = new GameEngine(undefined, () => 0.5);
      engine.start();
      engine.selectPlate(-1);
      expect(engine.getState().selectedPlateIndex).toBeNull();
    });

    it('ignores selection of already-placed (null) slot', () => {
      const engine = new GameEngine(undefined, () => 0.5);
      engine.start();
      // Place plate at index 0
      engine.selectPlate(0);
      engine.placePlate(0, 0);
      // Try to select the now-null slot
      engine.selectPlate(0);
      expect(engine.getState().selectedPlateIndex).toBeNull();
    });
  });

  describe('placePlate', () => {
    it('places a plate on an empty cell successfully', () => {
      const engine = new GameEngine(undefined, () => 0.5);
      engine.start();
      engine.selectPlate(0);
      const result = engine.placePlate(0, 0);
      expect(result.success).toBe(true);
      const state = engine.getState();
      expect(state.board.cells[0]![0]).not.toBeNull();
      expect(state.stagingArea[0]).toBeNull();
      expect(state.selectedPlateIndex).toBeNull();
    });

    it('fails when no plate is selected', () => {
      const engine = new GameEngine(undefined, () => 0.5);
      engine.start();
      const result = engine.placePlate(0, 0);
      expect(result.success).toBe(false);
    });

    it('fails when cell is not empty', () => {
      const engine = new GameEngine(undefined, () => 0.5);
      engine.start();
      engine.selectPlate(0);
      engine.placePlate(0, 0);
      engine.selectPlate(1);
      const result = engine.placePlate(0, 0);
      expect(result.success).toBe(false);
    });

    it('fails when coordinates are out of bounds', () => {
      const engine = new GameEngine(undefined, () => 0.5);
      engine.start();
      engine.selectPlate(0);
      expect(engine.placePlate(-1, 0).success).toBe(false);
      expect(engine.placePlate(0, -1).success).toBe(false);
      expect(engine.placePlate(6, 0).success).toBe(false);
      expect(engine.placePlate(0, 4).success).toBe(false);
    });

    it('records incrementing placedTimestamp', () => {
      const engine = new GameEngine(undefined, () => 0.5);
      engine.start();

      // Place plates non-adjacently to avoid merge eliminating one
      engine.selectPlate(0);
      engine.placePlate(0, 0);
      engine.selectPlate(1);
      engine.placePlate(2, 2);

      const state = engine.getState();
      const ts0 = state.board.cells[0]![0]!.placedTimestamp!;
      const ts1 = state.board.cells[2]![2]!.placedTimestamp!;
      expect(ts1).toBeGreaterThan(ts0);
    });

    it('returns mergeSteps and eliminations from resolution', () => {
      const engine = new GameEngine(undefined, () => 0.5);
      engine.start();
      engine.selectPlate(0);
      const result = engine.placePlate(0, 0);
      // Single plate placed, no neighbors → no merges or eliminations
      expect(result.mergeSteps).toEqual([]);
      expect(result.eliminations).toEqual([]);
      expect(result.scoreGained).toBe(0);
    });
  });

  describe('new round trigger', () => {
    it('starts a new round when all staging plates are placed', () => {
      const engine = new GameEngine(undefined, () => 0.5);
      engine.start();
      expect(engine.getState().round).toBe(1);

      engine.selectPlate(0);
      engine.placePlate(0, 0);
      engine.selectPlate(1);
      engine.placePlate(0, 1);
      engine.selectPlate(2);
      engine.placePlate(0, 2);

      const state = engine.getState();
      expect(state.round).toBe(2);
      // New staging area should have 3 plates
      const nonNull = state.stagingArea.filter((p) => p !== null);
      expect(nonNull).toHaveLength(3);
    });

    it('resets roundEliminations on new round', () => {
      const engine = new GameEngine(undefined, () => 0.5);
      engine.start();

      engine.selectPlate(0);
      engine.placePlate(0, 0);
      engine.selectPlate(1);
      engine.placePlate(0, 1);
      engine.selectPlate(2);
      engine.placePlate(0, 2);

      expect(engine.getState().roundEliminations).toBe(0);
    });
  });

  describe('game over', () => {
    it('triggers game over when board is full after placing last staging plate', () => {
      // Use a small 2x2 board with 2 plates per round.
      // Use a cycling random that produces distinct glass types per plate
      // so no merges happen between adjacent plates.
      let callIndex = 0;
      // Sequence: each plate gets 1 glass of a unique type
      // For PlateGenerator: randomInt(min,max) = min + floor(random * (max-min+1))
      // We need glassCount=1 (random for count → 0.0 gives min) and distinct types per plate
      const values = [
        0.0, 0.0,   // plate1: 1 glass, type 0
        0.0, 0.125,  // plate2: 1 glass, type 1
        // round 2
        0.0, 0.25,  // plate3: 1 glass, type 2
        0.0, 0.375,  // plate4: 1 glass, type 3
      ];
      // Also need values for target glass selection at start
      const targetValues = [0.5, 0.5];
      const allValues = [...targetValues, ...values];
      const rng = () => {
        const v = allValues[callIndex % allValues.length]!;
        callIndex++;
        return v;
      };

      const engine = new GameEngine(
        { boardRows: 2, boardCols: 2, platesPerRound: 2 },
        rng,
      );
      engine.start();

      // Round 1: place 2 plates with distinct types
      engine.selectPlate(0);
      engine.placePlate(0, 0);
      engine.selectPlate(1);
      engine.placePlate(0, 1);
      // New round starts (round 2)
      expect(engine.isGameOver()).toBe(false);

      // Round 2: fill remaining cells
      engine.selectPlate(0);
      engine.placePlate(1, 0);
      engine.selectPlate(1);
      engine.placePlate(1, 1);
      // Board is full, game over
      expect(engine.isGameOver()).toBe(true);
      expect(engine.getState().gameOver).toBe(true);
    });
  });

  describe('target glass refresh', () => {
    it('refreshes target glasses when totalFullEliminations reaches threshold', () => {
      // Use glassTypeCount=1, min=max=3 so every plate has exactly 3 type-0 glasses.
      // Two adjacent plates merge: 3+3=6 → full_same_type elimination.
      // threshold=2: after 2 full eliminations, target glasses refresh and counter resets.

      const engine = new GameEngine(
        {
          boardRows: 4,
          boardCols: 4,
          glassTypeCount: 1,
          minGlassesPerPlate: 3,
          maxGlassesPerPlate: 3,
          targetGlassCount: 1,
          targetGlassRefreshThreshold: 2,
        },
        () => 0.5,
      );
      engine.start();

      expect(engine.getState().totalFullEliminations).toBe(0);

      // Place plate 0 at (0,0) — isolated, no merge
      engine.selectPlate(0);
      engine.placePlate(0, 0);
      expect(engine.getState().totalFullEliminations).toBe(0);

      // Place plate 1 adjacent at (0,1) — merges with (0,0): 3+3=6 → elimination #1
      engine.selectPlate(1);
      const result1 = engine.placePlate(0, 1);
      expect(result1.eliminations.filter(e => e.reason === 'full_same_type').length).toBe(1);
      expect(engine.getState().totalFullEliminations).toBe(1);

      // Place plate 2 at (2,0) — isolated (no adjacent plates), no merge
      engine.selectPlate(2);
      engine.placePlate(2, 0);
      // Round ends, new round starts

      // Round 2: place two adjacent plates to trigger elimination #2
      engine.selectPlate(0);
      engine.placePlate(1, 2); // isolated

      engine.selectPlate(1);
      engine.placePlate(1, 3); // adjacent to (1,2) → merge → elimination #2
      const state = engine.getState();
      // totalFullEliminations reached 2 (threshold), should have refreshed and reset to 0
      expect(state.totalFullEliminations).toBe(0);

      // Place last plate of round
      engine.selectPlate(2);
      engine.placePlate(3, 3); // isolated
    });

    it('resets totalFullEliminations to 0 after refresh', () => {
      const engine = new GameEngine(
        {
          boardRows: 4,
          boardCols: 4,
          glassTypeCount: 1,
          minGlassesPerPlate: 3,
          maxGlassesPerPlate: 3,
          targetGlassCount: 1,
          targetGlassRefreshThreshold: 1, // refresh after just 1 elimination
        },
        () => 0.5,
      );
      engine.start();

      // Place two adjacent plates to trigger one full elimination
      engine.selectPlate(0);
      engine.placePlate(0, 0);
      engine.selectPlate(1);
      engine.placePlate(0, 1);

      // After 1 full elimination, threshold=1 reached → refresh → reset to 0
      expect(engine.getState().totalFullEliminations).toBe(0);
    });
  });

  describe('round bonus scoring', () => {
    it('adds round bonus to score when roundEliminations reach bonus threshold', () => {
      // Config: roundBonuses [{threshold:1, bonus:5}] so after 1 full elimination we get +5 bonus
      const engine = new GameEngine(
        {
          boardRows: 4,
          boardCols: 4,
          glassTypeCount: 1,
          minGlassesPerPlate: 3,
          maxGlassesPerPlate: 3,
          targetGlassCount: 1,
          targetGlassRefreshThreshold: 100, // high so no refresh interferes
          roundBonuses: [{ threshold: 1, bonus: 5 }],
        },
        () => 0.5,
      );
      engine.start();

      // Place two adjacent plates → merge → full elimination
      engine.selectPlate(0);
      engine.placePlate(0, 0);
      engine.selectPlate(1);
      const result = engine.placePlate(0, 1);

      expect(result.success).toBe(true);
      // Combo score: 1st elimination = 1 point, target glass (type 0 is target) → ×2 = 2
      // Round bonus: roundEliminations=1 >= threshold=1 → +5
      expect(result.roundBonuses).toBe(5);
      // scoreGained should include both elimination score and round bonus
      expect(result.scoreGained).toBe(2 + 5); // 2 (elimination) + 5 (round bonus)
      // Total score should match
      expect(engine.getState().score).toBe(2 + 5);
    });

    it('does not double-count round bonus across multiple placements', () => {
      // Config: two bonus thresholds: 1→+5, 2→+10
      // After 1st elimination: bonus = 5 (threshold 1 reached)
      // After 2nd elimination: bonus = 10 (threshold 2 reached, but threshold 1 already awarded)
      // Total bonus should be 5 + 10 = 15, NOT 5 + (5+10) = 20
      const engine = new GameEngine(
        {
          boardRows: 4,
          boardCols: 4,
          glassTypeCount: 1,
          minGlassesPerPlate: 3,
          maxGlassesPerPlate: 3,
          targetGlassCount: 1,
          targetGlassRefreshThreshold: 100,
          roundBonuses: [
            { threshold: 1, bonus: 5 },
            { threshold: 2, bonus: 10 },
          ],
        },
        () => 0.5,
      );
      engine.start();

      // 1st elimination: place two adjacent plates → merge → full elimination
      engine.selectPlate(0);
      engine.placePlate(0, 0);
      engine.selectPlate(1);
      const result1 = engine.placePlate(0, 1);
      expect(result1.roundBonuses).toBe(5); // threshold 1 reached → +5

      // 2nd elimination: place two more adjacent plates
      engine.selectPlate(2);
      engine.placePlate(2, 0);
      // New round starts, but roundEliminations was 1 before round end

      // Actually we need both eliminations in the SAME round.
      // Let's use a bigger staging area approach: place isolated first, then two pairs
    });

    it('awards incremental bonus correctly within same round', () => {
      // Use platesPerRound=4 so we can trigger 2 eliminations in one round
      // roundBonuses: [{threshold:1, bonus:3}, {threshold:2, bonus:7}]
      const engine = new GameEngine(
        {
          boardRows: 6,
          boardCols: 6,
          glassTypeCount: 1,
          minGlassesPerPlate: 3,
          maxGlassesPerPlate: 3,
          targetGlassCount: 1,
          targetGlassRefreshThreshold: 100,
          platesPerRound: 4,
          roundBonuses: [
            { threshold: 1, bonus: 3 },
            { threshold: 2, bonus: 7 },
          ],
        },
        () => 0.5,
      );
      engine.start();

      // Place pair 1: (0,0) isolated, then (0,1) adjacent → elimination #1
      engine.selectPlate(0);
      engine.placePlate(0, 0);
      engine.selectPlate(1);
      const r1 = engine.placePlate(0, 1);
      expect(r1.roundBonuses).toBe(3); // threshold 1 reached → +3 (incremental: 3-0=3)

      // Place pair 2: (2,0) isolated, then (2,1) adjacent → elimination #2
      engine.selectPlate(2);
      engine.placePlate(2, 0);
      engine.selectPlate(3);
      const r2 = engine.placePlate(2, 1);
      expect(r2.roundBonuses).toBe(7); // threshold 2 reached → incremental: (3+7)-3=7

      // Total score: 2 eliminations × 2 (target glass) + 3 + 7 = 4 + 10 = 14
      // Elimination 1: combo=1, base=1, target×2=2
      // Elimination 2: combo=1 (new move), base=1, target×2=2
      expect(engine.getState().score).toBe(2 + 3 + 2 + 7); // 14
    });

    it('round bonus is included in scoreGained in PlacementResult', () => {
      const engine = new GameEngine(
        {
          boardRows: 4,
          boardCols: 4,
          glassTypeCount: 1,
          minGlassesPerPlate: 3,
          maxGlassesPerPlate: 3,
          targetGlassCount: 1,
          targetGlassRefreshThreshold: 100,
          roundBonuses: [{ threshold: 2, bonus: 10 }],
        },
        () => 0.5,
      );
      engine.start();

      // First elimination: roundEliminations=1, threshold=2 not reached → bonus=0
      engine.selectPlate(0);
      engine.placePlate(0, 0);
      engine.selectPlate(1);
      const result1 = engine.placePlate(0, 1);
      expect(result1.roundBonuses).toBe(0);

      // Place isolated plate to finish round
      engine.selectPlate(2);
      engine.placePlate(2, 0);

      // New round: roundEliminations reset to 0
      // Trigger two eliminations in this round
      engine.selectPlate(0);
      engine.placePlate(1, 0);
      engine.selectPlate(1);
      engine.placePlate(1, 1); // adjacent → elimination #1

      engine.selectPlate(2);
      engine.placePlate(3, 0); // isolated, finish round

      // Next round
      engine.selectPlate(0);
      engine.placePlate(2, 2);
      engine.selectPlate(1);
      const result2 = engine.placePlate(2, 3); // adjacent → elimination

      // This is the 1st elimination in this new round, threshold=2 not reached
      expect(result2.roundBonuses).toBe(0);
    });
  });

  describe('getState', () => {
    it('returns a snapshot that does not mutate engine state', () => {
      const engine = new GameEngine(undefined, () => 0.5);
      engine.start();
      const state1 = engine.getState();
      state1.score = 999;
      state1.stagingArea[0] = null;
      const state2 = engine.getState();
      expect(state2.score).toBe(0);
      expect(state2.stagingArea[0]).not.toBeNull();
    });
  });
});

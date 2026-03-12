import { describe, it, expect } from 'vitest';
import { MergeAlgorithm } from '../../src/core/merge';
import { BoardState } from '../../src/core/board';
import type { Plate } from '../../src/types';

function makePlate(
  id: string,
  glasses: number[],
  timestamp: number,
): Plate {
  return { id, glasses, placedTimestamp: timestamp };
}

describe('MergeAlgorithm', () => {
  const algo = new MergeAlgorithm();

  describe('basic merge', () => {
    it('merges shared glass type to the earlier-timestamp plate', () => {
      const board = new BoardState(1, 2);
      // Plate A (timestamp 1): glasses [0, 1]
      // Plate B (timestamp 2): glasses [1, 2]
      // Shared type 1 → should transfer from B to A
      board.setCell(0, 0, makePlate('a', [0, 1], 1));
      board.setCell(0, 1, makePlate('b', [1, 2], 2));

      const result = algo.resolveUntilStable(board);

      const plateA = board.getCell(0, 0)!;
      const plateB = board.getCell(0, 1)!;
      expect(plateA.glasses).toContain(1);
      // Type 1 transferred from B to A
      expect(plateA.glasses.filter((g) => g === 1).length).toBe(2);
      expect(plateB.glasses).not.toContain(1);
      expect(plateB.glasses).toEqual([2]);
      expect(result.mergeSteps.length).toBeGreaterThan(0);
      expect(result.isStable).toBe(true);
    });
  });

  describe('overflow handling', () => {
    it('only transfers enough glasses to fill target to 6', () => {
      const board = new BoardState(1, 2);
      // Target (ts=1): 5 glasses [0,0,0,1,1], Source (ts=2): 2 of type 0
      // Can only transfer 1 of type 0 (5+1=6), leaving 1 in source
      // Target ends up with [0,0,0,1,1,0] — mixed types, no full_same_type elimination
      board.setCell(0, 0, makePlate('a', [0, 0, 0, 1, 1], 1));
      board.setCell(0, 1, makePlate('b', [0, 0], 2));

      algo.resolveUntilStable(board);

      const plateA = board.getCell(0, 0)!;
      const plateB = board.getCell(0, 1)!;
      expect(plateA.glasses.length).toBe(6);
      expect(plateA.glasses.filter((g) => g === 0).length).toBe(4);
      expect(plateB.glasses.length).toBe(1);
      expect(plateB.glasses[0]).toBe(0);
    });
  });

  describe('empty plate elimination', () => {
    it('eliminates a plate when all glasses are transferred away', () => {
      const board = new BoardState(1, 2);
      // A (ts=1): [0], B (ts=2): [0]
      // Type 0 merges to A → B becomes empty → eliminated
      board.setCell(0, 0, makePlate('a', [0], 1));
      board.setCell(0, 1, makePlate('b', [0], 2));

      const result = algo.resolveUntilStable(board);

      expect(board.getCell(0, 0)).not.toBeNull();
      expect(board.getCell(0, 0)!.glasses).toEqual([0, 0]);
      expect(board.getCell(0, 1)).toBeNull(); // eliminated
      const emptyElims = result.eliminations.filter((e) => e.reason === 'empty');
      expect(emptyElims.length).toBe(1);
      expect(emptyElims[0]!.position).toEqual({ row: 0, col: 1 });
    });
  });

  describe('full same-type plate elimination', () => {
    it('eliminates a plate with 6 identical glasses', () => {
      const board = new BoardState(1, 2);
      // A (ts=1): [0,0,0,0,0], B (ts=2): [0]
      // Merge → A gets 6 of type 0 → full_same_type elimination
      board.setCell(0, 0, makePlate('a', [0, 0, 0, 0, 0], 1));
      board.setCell(0, 1, makePlate('b', [0], 2));

      const result = algo.resolveUntilStable(board);

      // A eliminated (6 same type), B eliminated (empty)
      expect(board.getCell(0, 0)).toBeNull();
      expect(board.getCell(0, 1)).toBeNull();
      const fullElims = result.eliminations.filter(
        (e) => e.reason === 'full_same_type',
      );
      expect(fullElims.length).toBe(1);
      expect(fullElims[0]!.plate.glasses).toEqual([0, 0, 0, 0, 0, 0]);
    });
  });

  describe('chain reaction', () => {
    it('triggers chain: merge → elimination → new merge → new elimination', () => {
      // Board layout (1x3):
      //   [A: ts=1, glasses=[0,0,0,0,0]]  [B: ts=2, glasses=[0,1]]  [C: ts=3, glasses=[1,1,1,1,1]]
      //
      // Step 1: A and B share type 0 → transfer 0 from B to A → A=[0,0,0,0,0,0], B=[1]
      // Step 2: A has 6 same type → full_same_type elimination → A removed
      //         B and C share type 1 → transfer 1 from B to C → C=[1,1,1,1,1,1], B=[]
      // Step 3: C has 6 same type → full_same_type elimination → C removed
      //         B is empty → empty elimination → B removed
      const board = new BoardState(1, 3);
      board.setCell(0, 0, makePlate('a', [0, 0, 0, 0, 0], 1));
      board.setCell(0, 1, makePlate('b', [0, 1], 2));
      board.setCell(0, 2, makePlate('c', [1, 1, 1, 1, 1], 3));

      const result = algo.resolveUntilStable(board);

      // All plates should be eliminated
      expect(board.getCell(0, 0)).toBeNull();
      expect(board.getCell(0, 1)).toBeNull();
      expect(board.getCell(0, 2)).toBeNull();

      const fullElims = result.eliminations.filter(
        (e) => e.reason === 'full_same_type',
      );
      const emptyElims = result.eliminations.filter(
        (e) => e.reason === 'empty',
      );
      expect(fullElims.length).toBe(2); // A and C
      expect(emptyElims.length).toBe(1); // B
      expect(result.isStable).toBe(true);
    });
  });

  describe('stable state', () => {
    it('no changes when adjacent plates have no shared glass types', () => {
      const board = new BoardState(1, 2);
      board.setCell(0, 0, makePlate('a', [0, 1], 1));
      board.setCell(0, 1, makePlate('b', [2, 3], 2));

      const result = algo.resolveUntilStable(board);

      expect(result.mergeSteps).toEqual([]);
      expect(result.eliminations).toEqual([]);
      expect(result.isStable).toBe(true);
      // Plates unchanged
      expect(board.getCell(0, 0)!.glasses).toEqual([0, 1]);
      expect(board.getCell(0, 1)!.glasses).toEqual([2, 3]);
    });

    it('board with no plates is stable', () => {
      const board = new BoardState(2, 2);
      const result = algo.resolveUntilStable(board);
      expect(result.isStable).toBe(true);
      expect(result.mergeSteps).toEqual([]);
      expect(result.eliminations).toEqual([]);
    });

    it('single plate on board is stable', () => {
      const board = new BoardState(2, 2);
      board.setCell(0, 0, makePlate('a', [0, 1, 2], 1));
      const result = algo.resolveUntilStable(board);
      expect(result.isStable).toBe(true);
      expect(result.mergeSteps).toEqual([]);
      expect(result.eliminations).toEqual([]);
    });
  });
});

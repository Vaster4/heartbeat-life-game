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
    it('redistributes glasses by type when adjacent plates share a type', () => {
      const board = new BoardState(1, 2);
      // A (ts=1): glasses [0, 1]
      // B (ts=2): glasses [1, 2]
      // Shared type 1 → triggers merge group {A, B}
      // Total: type1×2, type0×1, type2×1
      // A (earliest) gets type1(most), B gets type0 + type2
      board.setCell(0, 0, makePlate('a', [0, 1], 1));
      board.setCell(0, 1, makePlate('b', [1, 2], 2));

      const result = algo.resolveUntilStable(board);

      const plateA = board.getCell(0, 0)!;
      const plateB = board.getCell(0, 1)!;
      // A gets the most common type (type 1, 2 glasses)
      expect(plateA.glasses.sort()).toEqual([1, 1]);
      // B gets the remaining types
      expect(plateB.glasses.sort()).toEqual([0, 2]);
      expect(result.mergeSteps.length).toBeGreaterThan(0);
      expect(result.isStable).toBe(true);
    });
  });

  describe('overflow handling', () => {
    it('only transfers enough glasses to fill target to 6, then displacement separates types', () => {
      const board = new BoardState(1, 2);
      // Target (ts=1): 5 glasses [0,0,0,1,1], Source (ts=2): 2 of type 0
      // Step 1 - Group merge: transfer 1 of type 0 from B→A (5+1=6 cap), A=[0×4,1×2], B=[0×1]
      // Step 2 - Displacement: A is full & mixed, push type 1 to B → A=[0×4], B=[0,1,1]
      // Step 3 - Group merge: type 0 from B→A → A=[0×5], B=[1,1]
      // Stable: each plate is single-type
      board.setCell(0, 0, makePlate('a', [0, 0, 0, 1, 1], 1));
      board.setCell(0, 1, makePlate('b', [0, 0], 2));

      algo.resolveUntilStable(board);

      const plateA = board.getCell(0, 0)!;
      const plateB = board.getCell(0, 1)!;
      // A ends up with all type 0 (5 glasses)
      expect(plateA.glasses.every((g) => g === 0)).toBe(true);
      expect(plateA.glasses.length).toBe(5);
      // B ends up with all type 1 (2 glasses)
      expect(plateB.glasses.every((g) => g === 1)).toBe(true);
      expect(plateB.glasses.length).toBe(2);
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

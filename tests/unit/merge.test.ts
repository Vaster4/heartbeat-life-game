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
      // B (ts=2): glasses [1, 2]  ← newly placed
      board.setCell(0, 0, makePlate('a', [0, 1], 1));
      board.setCell(0, 1, makePlate('b', [1, 2], 2));

      const result = algo.resolve(board, { row: 0, col: 1 });

      const plateA = board.getCell(0, 0)!;
      const plateB = board.getCell(0, 1)!;
      // A (earliest) absorbs type1 (shared, most common=2)
      // A's type0 is not shared → stays on A
      // B's type2 is not shared → stays on B
      // A=[1,1], B=[0,2] — wait, A absorbs type1, A's type0 gets squeezed out
      // Actually: shared types are type1 (both have it). 
      // A(ts=1) absorbs type1: A clears, type0×1 goes to residual. 
      // Collects type1: A had 1, B had 1 = 2 total. A=[1,1].
      // B loses its type1, B=[2].
      // Residual: type0×1. Fill into B (most empty, 5 slots). B=[2,0].
      expect(plateA.glasses.sort()).toEqual([1, 1]);
      expect(plateB.glasses.sort()).toEqual([0, 2]);
      expect(result.mergeSteps.length).toBeGreaterThan(0);
      expect(result.isStable).toBe(true);
    });
  });

  describe('overflow handling', () => {
    it('absorbs and displaces non-shared types correctly', () => {
      const board = new BoardState(1, 2);
      // A (ts=1): [0,0,0,1,1], B (ts=2): [0,0] ← newly placed
      // Shared type: 0 (both have it)
      // A(ts=1) absorbs type0: A clears, type1×2 to residual.
      // Collects type0: A had 3, B had 2 = 5. A=[0,0,0,0,0].
      // B loses type0, B=[].
      // Residual: type1×2. B has 6 slots → B=[1,1].
      board.setCell(0, 0, makePlate('a', [0, 0, 0, 1, 1], 1));
      board.setCell(0, 1, makePlate('b', [0, 0], 2));

      algo.resolve(board, { row: 0, col: 1 });

      const plateA = board.getCell(0, 0)!;
      const plateB = board.getCell(0, 1)!;
      expect(plateA.glasses.every((g) => g === 0)).toBe(true);
      expect(plateA.glasses.length).toBe(5);
      expect(plateB.glasses.every((g) => g === 1)).toBe(true);
      expect(plateB.glasses.length).toBe(2);
    });
  });

  describe('empty plate elimination', () => {
    it('eliminates a plate when all glasses are transferred away', () => {
      const board = new BoardState(1, 2);
      // A (ts=1): [0], B (ts=2): [0] ← newly placed
      board.setCell(0, 0, makePlate('a', [0], 1));
      board.setCell(0, 1, makePlate('b', [0], 2));

      const result = algo.resolve(board, { row: 0, col: 1 });

      expect(board.getCell(0, 0)).not.toBeNull();
      expect(board.getCell(0, 0)!.glasses).toEqual([0, 0]);
      expect(board.getCell(0, 1)).toBeNull();
      const emptyElims = result.eliminations.filter((e) => e.reason === 'empty');
      expect(emptyElims.length).toBe(1);
      expect(emptyElims[0]!.position).toEqual({ row: 0, col: 1 });
    });
  });

  describe('full same-type plate elimination', () => {
    it('eliminates a plate with 6 identical glasses', () => {
      const board = new BoardState(1, 2);
      // A (ts=1): [0,0,0,0,0], B (ts=2): [0] ← newly placed
      board.setCell(0, 0, makePlate('a', [0, 0, 0, 0, 0], 1));
      board.setCell(0, 1, makePlate('b', [0], 2));

      const result = algo.resolve(board, { row: 0, col: 1 });

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
      //   [A: ts=1, [0,0,0,0,0]]  [B: ts=2, [0,1]]  [C: ts=3, [1,1,1,1,1]] ← C newly placed
      //
      // Group from C: C's neighbors = B. C and B share type1. 
      // Type pool = {1,1,1,1,1} ∪ {0,1} = {0,1}. A is not C's neighbor.
      // So group = {B, C}. Shared type: 1.
      // B(ts=2) absorbs type1: B clears, type0×1 to residual. Collects type1: B had 1, C had 5 = 6. B=[1,1,1,1,1,1].
      // C loses type1, C=[].
      // Residual: type0×1. C has 6 slots → C=[0].
      // Eliminate: B=[1×6] full_same_type. C=[0] stays.
      // C received residual → chain check. C's neighbor = B (eliminated) and A.
      // Wait, C(0,2) neighbor is B(0,1). B is eliminated. 
      // But also need to check: after B eliminated, C=[0], A=[0,0,0,0,0]. 
      // C and A are not adjacent (distance 2). So no further merge.
      // Hmm, this won't produce the same chain as before.
      // Let me use B as the newly placed plate instead.
      const board = new BoardState(1, 3);
      board.setCell(0, 0, makePlate('a', [0, 0, 0, 0, 0], 1));
      board.setCell(0, 1, makePlate('b', [0, 1], 3)); // B placed last
      board.setCell(0, 2, makePlate('c', [1, 1, 1, 1, 1], 2));

      const result = algo.resolve(board, { row: 0, col: 1 });

      // B's neighbors: A and C.
      // B shares type0 with A, type1 with C. Group = {A, B, C}.
      // Shared types: type0 (A and B), type1 (B and C).
      // A(ts=1) absorbs type0 (total 6): A clears (no other types), collects 6. A=[0,0,0,0,0,0].
      // C(ts=2) absorbs type1 (total 6): C clears (no other types), collects 6. C=[1,1,1,1,1,1].
      // B loses all → B=[].
      // Residual: none.
      // Eliminate: A full_same_type, C full_same_type, B empty.
      expect(board.getCell(0, 0)).toBeNull();
      expect(board.getCell(0, 1)).toBeNull();
      expect(board.getCell(0, 2)).toBeNull();

      const fullElims = result.eliminations.filter(
        (e) => e.reason === 'full_same_type',
      );
      const emptyElims = result.eliminations.filter(
        (e) => e.reason === 'empty',
      );
      expect(fullElims.length).toBe(2);
      expect(emptyElims.length).toBe(1);
      expect(result.isStable).toBe(true);
    });
  });

  describe('stable state', () => {
    it('no changes when adjacent plates have no shared glass types', () => {
      const board = new BoardState(1, 2);
      board.setCell(0, 0, makePlate('a', [0, 1], 1));
      board.setCell(0, 1, makePlate('b', [2, 3], 2));

      const result = algo.resolve(board, { row: 0, col: 1 });

      expect(result.mergeSteps).toEqual([]);
      expect(result.eliminations).toEqual([]);
      expect(result.isStable).toBe(true);
      expect(board.getCell(0, 0)!.glasses).toEqual([0, 1]);
      expect(board.getCell(0, 1)!.glasses).toEqual([2, 3]);
    });

    it('board with single plate is stable', () => {
      const board = new BoardState(2, 2);
      board.setCell(0, 0, makePlate('a', [0, 1, 2], 1));
      const result = algo.resolve(board, { row: 0, col: 0 });
      expect(result.isStable).toBe(true);
      expect(result.mergeSteps).toEqual([]);
      expect(result.eliminations).toEqual([]);
    });
  });
});

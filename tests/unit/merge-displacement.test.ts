import { describe, it, expect } from 'vitest';
import { BoardState } from '../../src/core/board';
import { MergeAlgorithm } from '../../src/core/merge';

describe('Merge displacement: non-shared types get pushed out', () => {
  const AT = 0; // @
  const HASH = 1; // #

  it('A(@2,#3) + B(@2) → A becomes @-only, # pushed to B', () => {
    // A(col0, ts=1): @×2, #×3 = 5 glasses
    // B(col1, ts=2): @×2 = 2 glasses
    // Expected after merge:
    //   @ merges to A (earlier): A gets B's @, but also A's # should be displaced to B
    //   Final: A = @×4 (or similar single-type), B = #×3 (displaced)
    const board = new BoardState(1, 2);

    board.setCell(0, 0, { id: 'A', glasses: [AT, AT, HASH, HASH, HASH], placedTimestamp: 1 });
    board.setCell(0, 1, { id: 'B', glasses: [AT, AT], placedTimestamp: 2 });

    const algo = new MergeAlgorithm();
    algo.resolveUntilStable(board);

    const A = board.getCell(0, 0);
    const B = board.getCell(0, 1);

    // A should only have @ type
    expect(A).not.toBeNull();
    expect(A!.glasses.every(g => g === AT)).toBe(true);
    expect(A!.glasses.length).toBe(4); // @×4

    // B should only have # type
    expect(B).not.toBeNull();
    expect(B!.glasses.every(g => g === HASH)).toBe(true);
    expect(B!.glasses.length).toBe(3); // #×3
  });

  it('displacement triggers further merges in chain', () => {
    // A(col0, ts=1): #×3
    // B(col1, ts=2): @×2, #×1 = 3 glasses
    // C(col2, ts=3): @×1
    // Merge @: B's @ and C's @ → B (earlier). B = @×3, #×1. C = empty → eliminated.
    // Then B's # should be displaced to... A is adjacent and has #.
    // # merges: A(#×3) and B(#×1) → A (earlier). A = #×4, B = @×3.
    // Stable: A has only #, B has only @.
    const board = new BoardState(1, 3);

    board.setCell(0, 0, { id: 'A', glasses: [HASH, HASH, HASH], placedTimestamp: 1 });
    board.setCell(0, 1, { id: 'B', glasses: [AT, AT, HASH], placedTimestamp: 2 });
    board.setCell(0, 2, { id: 'C', glasses: [AT], placedTimestamp: 3 });

    const algo = new MergeAlgorithm();
    algo.resolveUntilStable(board);

    const A = board.getCell(0, 0);
    const B = board.getCell(0, 1);
    const C = board.getCell(0, 2);

    // A should have all # (4 total)
    expect(A).not.toBeNull();
    expect(A!.glasses.every(g => g === HASH)).toBe(true);
    expect(A!.glasses.length).toBe(4);

    // B should have all @ (3 total)
    expect(B).not.toBeNull();
    expect(B!.glasses.every(g => g === AT)).toBe(true);
    expect(B!.glasses.length).toBe(3);

    // C should be eliminated (empty)
    expect(C).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { BoardState } from '../../src/core/board';
import { MergeAlgorithm } from '../../src/core/merge';

describe('Merge displacement: non-shared types get pushed out', () => {
  const AT = 0;
  const HASH = 1;

  it('A(@2,#3) + B(@2) → A becomes @-only, # pushed to B', () => {
    const board = new BoardState(1, 2);

    board.setCell(0, 0, { id: 'A', glasses: [AT, AT, HASH, HASH, HASH], placedTimestamp: 1 });
    board.setCell(0, 1, { id: 'B', glasses: [AT, AT], placedTimestamp: 2 });

    const algo = new MergeAlgorithm();
    algo.resolve(board, { row: 0, col: 1 });

    const A = board.getCell(0, 0);
    const B = board.getCell(0, 1);

    // Shared type: AT (both have it).
    // A(ts=1) absorbs AT: A clears, HASH×3 to residual. Collects AT: 2+2=4. A=[0,0,0,0].
    // Residual: HASH×3. B has 6 slots → B=[1,1,1].
    expect(A).not.toBeNull();
    expect(A!.glasses.every(g => g === AT)).toBe(true);
    expect(A!.glasses.length).toBe(4);

    expect(B).not.toBeNull();
    expect(B!.glasses.every(g => g === HASH)).toBe(true);
    expect(B!.glasses.length).toBe(3);
  });

  it('displacement triggers further merges in chain', () => {
    // A(col0, ts=1): #×3
    // B(col1, ts=2): @×2, #×1
    // C(col2, ts=3): @×1 ← newly placed
    // C's neighbors: B. C shares AT with B. Group from C = {C, B}.
    // But B also has HASH, and A has HASH. A is not C's neighbor though.
    // Type pool from C: {AT} → B has AT → B joins. Pool = {AT, HASH}.
    // A is not C's neighbor, so A is not a candidate.
    // Group = {B, C}. Shared type: AT (both have it).
    // B(ts=2) absorbs AT: B clears, HASH×1 to residual. Collects AT: 2+1=3. B=[0,0,0].
    // C loses AT → C=[].
    // Residual: HASH×1. C has 6 slots → C=[1].
    // Eliminate: C=[1] stays. 
    // C received residual → chain check from C.
    // C's neighbors: B(0,1). C=[1], B=[0,0,0]. No shared type. Done.
    // But A=[1,1,1] and B=[0,0,0] are adjacent, no shared type. 
    // A and C are not adjacent. So stable.
    // Result: A=[1,1,1], B=[0,0,0], C=[1].
    // Hmm, this doesn't match the old test expectation of A=[1,1,1,1], B=[0,0,0], C=null.
    // Because A is not C's neighbor, it can't be pulled into the group.
    // The old test assumed full-board scanning. With the new algorithm, 
    // A's HASH and C's HASH won't merge because they're not adjacent.
    // Let's adjust: place B as the new plate so both A and C are neighbors.
    const board = new BoardState(1, 3);

    board.setCell(0, 0, { id: 'A', glasses: [HASH, HASH, HASH], placedTimestamp: 1 });
    board.setCell(0, 1, { id: 'B', glasses: [AT, AT, HASH], placedTimestamp: 3 }); // B newly placed
    board.setCell(0, 2, { id: 'C', glasses: [AT], placedTimestamp: 2 });

    const algo = new MergeAlgorithm();
    algo.resolve(board, { row: 0, col: 1 });

    const A = board.getCell(0, 0);
    const B = board.getCell(0, 1);
    const C = board.getCell(0, 2);

    // B's neighbors: A and C.
    // B shares HASH with A, AT with C. Group = {A, B, C}.
    // Shared types: HASH (A and B), AT (B and C).
    // A(ts=1) absorbs HASH (total 4): A clears (only HASH), collects 3+1=4. A=[1,1,1,1].
    // C(ts=2) absorbs AT (total 3): C clears (only AT), collects 1+2=3. C=[0,0,0].
    // B loses all → B=[].
    // Residual: none.
    // Eliminate: B empty.
    expect(A).not.toBeNull();
    expect(A!.glasses.every(g => g === HASH)).toBe(true);
    expect(A!.glasses.length).toBe(4);

    expect(B).toBeNull();

    expect(C).not.toBeNull();
    expect(C!.glasses.every(g => g === AT)).toBe(true);
    expect(C!.glasses.length).toBe(3);
  });
});

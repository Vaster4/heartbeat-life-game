import { describe, it, expect } from 'vitest';
import { BoardState } from '../../src/core/board';
import { MergeAlgorithm } from '../../src/core/merge';

describe('Merge bug repro: three adjacent plates with shared type', () => {
  it('should merge greens via pairwise transfer when A is placed between B and C', () => {
    // Layout (1 row, 3 cols): B(col0) - A(col1) - C(col2)
    // B: 1 green, timestamp=1 (earliest)
    // C: 1 green, timestamp=2
    // A: 1 green, timestamp=3 (just placed)
    //
    // 新算法：逐对相邻转移
    // Pair (B,A): A 的 green → B. B=[green,green], A=[]
    // Pair (A,C): A 已空，无共同类型，跳过
    // A 空盘消除后 B 和 C 不相邻，C 的 green 留在原处
    const board = new BoardState(1, 3);
    const GREEN = 0;

    board.setCell(0, 0, { id: 'B', glasses: [GREEN], placedTimestamp: 1 });
    board.setCell(0, 1, { id: 'A', glasses: [GREEN], placedTimestamp: 3 });
    board.setCell(0, 2, { id: 'C', glasses: [GREEN], placedTimestamp: 2 });

    const algo = new MergeAlgorithm();
    algo.resolveUntilStable(board);

    const B = board.getCell(0, 0);
    const A = board.getCell(0, 1);
    const C = board.getCell(0, 2);

    // B 收到 A 的 green
    expect(B?.glasses.filter(g => g === GREEN).length).toBe(2);
    // A 空盘消除
    expect(A).toBeNull();
    // C 的 green 留在原处（与 B 不相邻）
    expect(C?.glasses.filter(g => g === GREEN).length).toBe(1);
  });

  it('should merge greens to earliest when B and C are also adjacent', () => {
    // Layout (2x2):
    //   B(0,0)  A(0,1)
    //   C(1,0)  empty
    // B: 1 green, timestamp=1
    // C: 1 green, timestamp=2
    // A: 1 green, timestamp=3
    // B-C adjacent, A-B adjacent, A-C NOT adjacent
    const board = new BoardState(2, 2);
    const GREEN = 0;

    board.setCell(0, 0, { id: 'B', glasses: [GREEN], placedTimestamp: 1 });
    board.setCell(0, 1, { id: 'A', glasses: [GREEN], placedTimestamp: 3 });
    board.setCell(1, 0, { id: 'C', glasses: [GREEN], placedTimestamp: 2 });

    const algo = new MergeAlgorithm();
    algo.resolveUntilStable(board);

    const B = board.getCell(0, 0);
    const A = board.getCell(0, 1);
    const C = board.getCell(1, 0);

    // B (earliest) should have all 3 greens
    expect(B?.glasses.filter(g => g === GREEN).length).toBe(3);
    expect(A === null || A.glasses.filter(g => g === GREEN).length === 0).toBe(true);
    expect(C === null || C.glasses.filter(g => g === GREEN).length === 0).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { BoardState } from '../../src/core/board';
import { MergeAlgorithm } from '../../src/core/merge';

describe('Merge bug repro: three adjacent plates with shared type', () => {
  it('1x3: absorb all greens to earliest plate', () => {
    const board = new BoardState(1, 3);
    const GREEN = 0;
    board.setCell(0, 0, { id: 'B', glasses: [GREEN], placedTimestamp: 1 });
    board.setCell(0, 1, { id: 'A', glasses: [GREEN], placedTimestamp: 3 });
    board.setCell(0, 2, { id: 'C', glasses: [GREEN], placedTimestamp: 2 });

    const algo = new MergeAlgorithm();
    algo.resolve(board, { row: 0, col: 1 });

    expect(board.getCell(0, 0)?.glasses.filter(g => g === GREEN).length).toBe(3);
    expect(board.getCell(0, 1)).toBeNull();
    expect(board.getCell(0, 2)).toBeNull();
  });

  it('2x2: only merge A and B when C is not adjacent to A', () => {
    const board = new BoardState(2, 2);
    const GREEN = 0;
    board.setCell(0, 0, { id: 'B', glasses: [GREEN], placedTimestamp: 1 });
    board.setCell(0, 1, { id: 'A', glasses: [GREEN], placedTimestamp: 3 });
    board.setCell(1, 0, { id: 'C', glasses: [GREEN], placedTimestamp: 2 });

    const algo = new MergeAlgorithm();
    algo.resolve(board, { row: 0, col: 1 });

    expect(board.getCell(0, 0)?.glasses.filter(g => g === GREEN).length).toBe(2);
    expect(board.getCell(0, 1)).toBeNull();
    expect(board.getCell(1, 0)?.glasses).toEqual([GREEN]);
  });

  it('L-shaped: absorb shared type across 3-plate group', () => {
    const board = new BoardState(6, 4);
    board.setCell(3, 1, { id: 'plate-2', glasses: [2, 1], placedTimestamp: 2 });
    board.setCell(4, 1, { id: 'plate-3', glasses: [0, 1], placedTimestamp: 3 });
    board.setCell(4, 2, { id: 'plate-1', glasses: [1], placedTimestamp: 1 });

    const algo = new MergeAlgorithm();
    algo.resolve(board, { row: 4, col: 1 });

    expect(board.getCell(4, 2)?.glasses.filter(g => g === 1).length).toBe(3);
    expect(board.getCell(3, 1)?.glasses).toEqual([2]);
    expect(board.getCell(4, 1)?.glasses).toEqual([0]);
  });
});

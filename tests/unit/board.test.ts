import { describe, it, expect } from 'vitest';
import { BoardState } from '../../src/core/board';
import type { Plate } from '../../src/types';

function makePlate(id: string, glasses: number[] = [], timestamp: number | null = null): Plate {
  return { id, glasses, placedTimestamp: timestamp };
}

describe('BoardState', () => {
  describe('constructor', () => {
    it('creates a rows × cols grid of null cells', () => {
      const board = new BoardState(6, 4);
      expect(board.rows).toBe(6);
      expect(board.cols).toBe(4);
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 4; c++) {
          expect(board.getCell(r, c)).toBeNull();
        }
      }
    });

    it('handles 1×1 board', () => {
      const board = new BoardState(1, 1);
      expect(board.rows).toBe(1);
      expect(board.cols).toBe(1);
      expect(board.getCell(0, 0)).toBeNull();
    });
  });

  describe('getCell / setCell', () => {
    it('sets and retrieves a plate', () => {
      const board = new BoardState(3, 3);
      const plate = makePlate('p1', [0, 1, 2], 100);
      board.setCell(1, 2, plate);
      expect(board.getCell(1, 2)).toBe(plate);
    });

    it('can clear a cell by setting null', () => {
      const board = new BoardState(2, 2);
      const plate = makePlate('p1');
      board.setCell(0, 0, plate);
      board.setCell(0, 0, null);
      expect(board.getCell(0, 0)).toBeNull();
    });
  });

  describe('isEmpty', () => {
    it('returns true for empty cells', () => {
      const board = new BoardState(2, 2);
      expect(board.isEmpty(0, 0)).toBe(true);
    });

    it('returns false for occupied cells', () => {
      const board = new BoardState(2, 2);
      board.setCell(0, 0, makePlate('p1'));
      expect(board.isEmpty(0, 0)).toBe(false);
    });
  });

  describe('getNeighbors', () => {
    it('returns 4 neighbors for a center cell', () => {
      const board = new BoardState(3, 3);
      const neighbors = board.getNeighbors(1, 1);
      expect(neighbors).toHaveLength(4);
      expect(neighbors).toContainEqual({ row: 0, col: 1 });
      expect(neighbors).toContainEqual({ row: 2, col: 1 });
      expect(neighbors).toContainEqual({ row: 1, col: 0 });
      expect(neighbors).toContainEqual({ row: 1, col: 2 });
    });

    it('returns 2 neighbors for a corner cell', () => {
      const board = new BoardState(3, 3);
      const neighbors = board.getNeighbors(0, 0);
      expect(neighbors).toHaveLength(2);
      expect(neighbors).toContainEqual({ row: 1, col: 0 });
      expect(neighbors).toContainEqual({ row: 0, col: 1 });
    });

    it('returns 3 neighbors for an edge cell', () => {
      const board = new BoardState(3, 3);
      const neighbors = board.getNeighbors(0, 1);
      expect(neighbors).toHaveLength(3);
    });

    it('returns 0 neighbors for a 1×1 board', () => {
      const board = new BoardState(1, 1);
      expect(board.getNeighbors(0, 0)).toHaveLength(0);
    });
  });

  describe('hasEmptyCell', () => {
    it('returns true for a fresh board', () => {
      const board = new BoardState(2, 2);
      expect(board.hasEmptyCell()).toBe(true);
    });

    it('returns false when all cells are filled', () => {
      const board = new BoardState(2, 2);
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          board.setCell(r, c, makePlate(`p${r}${c}`));
        }
      }
      expect(board.hasEmptyCell()).toBe(false);
    });

    it('returns true when at least one cell is empty', () => {
      const board = new BoardState(2, 2);
      board.setCell(0, 0, makePlate('p1'));
      board.setCell(0, 1, makePlate('p2'));
      board.setCell(1, 0, makePlate('p3'));
      expect(board.hasEmptyCell()).toBe(true);
    });
  });

  describe('clone', () => {
    it('creates a deep copy with identical cell values', () => {
      const board = new BoardState(2, 2);
      const plate = makePlate('p1', [0, 1, 2], 100);
      board.setCell(0, 0, plate);

      const cloned = board.clone() as BoardState;
      expect(cloned.rows).toBe(2);
      expect(cloned.cols).toBe(2);
      expect(cloned.getCell(0, 0)).toEqual(plate);
      expect(cloned.getCell(0, 1)).toBeNull();
    });

    it('modifying the clone does not affect the original', () => {
      const board = new BoardState(2, 2);
      board.setCell(0, 0, makePlate('p1', [0, 1], 100));

      const cloned = board.clone() as BoardState;
      cloned.setCell(0, 0, null);
      expect(board.getCell(0, 0)).not.toBeNull();
    });

    it('deep copies plate glasses array', () => {
      const board = new BoardState(2, 2);
      const plate = makePlate('p1', [0, 1, 2], 100);
      board.setCell(0, 0, plate);

      const cloned = board.clone() as BoardState;
      const clonedPlate = cloned.getCell(0, 0) as Plate;
      clonedPlate.glasses.push(3);

      expect(plate.glasses).toHaveLength(3);
      expect(clonedPlate.glasses).toHaveLength(4);
    });
  });
});

import type { Cell, CellPosition, IBoardState, Obstacle, Plate } from '../types';

/**
 * 棋盘状态管理类。
 * 维护 rows × cols 的二维网格，每个格子可以放置一个 Plate、障碍石或为空。
 */
export class BoardState implements IBoardState {
  readonly rows: number;
  readonly cols: number;
  private cells: Cell[][];
  private obstacles: (Obstacle | null)[][];

  constructor(rows: number, cols: number) {
    this.rows = rows;
    this.cols = cols;
    this.cells = Array.from({ length: rows }, () =>
      Array.from<Cell>({ length: cols }).fill(null),
    );
    this.obstacles = Array.from({ length: rows }, () =>
      Array.from<Obstacle | null>({ length: cols }).fill(null),
    );
  }

  getCell(row: number, col: number): Cell {
    return this.cells[row]![col]!;
  }

  setCell(row: number, col: number, plate: Plate | null): void {
    this.cells[row]![col] = plate;
  }

  isEmpty(row: number, col: number): boolean {
    return this.cells[row]![col] === null;
  }

  getObstacle(row: number, col: number): Obstacle | null {
    return this.obstacles[row]![col] ?? null;
  }

  setObstacle(row: number, col: number, obstacle: Obstacle | null): void {
    this.obstacles[row]![col] = obstacle;
  }

  isObstacle(row: number, col: number): boolean {
    return this.obstacles[row]![col] !== null;
  }

  isPlaceable(row: number, col: number): boolean {
    return this.isEmpty(row, col) && !this.isObstacle(row, col);
  }

  getNeighbors(row: number, col: number): CellPosition[] {
    const directions: [number, number][] = [
      [-1, 0], [1, 0], [0, -1], [0, 1],
    ];
    const neighbors: CellPosition[] = [];
    for (const [dr, dc] of directions) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
        neighbors.push({ row: nr, col: nc });
      }
    }
    return neighbors;
  }

  hasEmptyCell(): boolean {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.isPlaceable(r, c)) return true;
      }
    }
    return false;
  }

  clone(): IBoardState {
    const copy = new BoardState(this.rows, this.cols);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.cells[r]![c] ?? null;
        if (cell !== null) {
          copy.cells[r]![c] = {
            id: cell.id,
            glasses: [...cell.glasses],
            placedTimestamp: cell.placedTimestamp,
          };
        }
        const obs = this.obstacles[r]![c];
        if (obs) {
          copy.obstacles[r]![c] = { ...obs };
        }
      }
    }
    return copy;
  }
}

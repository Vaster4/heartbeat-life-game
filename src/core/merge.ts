import type {
  CellPosition,
  EliminationEvent,
  GlassType,
  IBoardState,
  IMergeAlgorithm,
  MergeStep,
  Plate,
  ResolutionResult,
} from '../types';

const MAX_ITERATIONS = 1000;

/**
 * 合并算法：
 * 对于每种酒杯类型，找到所有通过相邻关系连通的、包含该类型酒杯的盘子群组，
 * 将该类型的所有酒杯集中到群组中时间戳最早的盘子（不超过6个上限）。
 * 然后检查消除条件，循环直到棋盘达到稳定态。
 */
export class MergeAlgorithm implements IMergeAlgorithm {
  resolveUntilStable(board: IBoardState): ResolutionResult {
    const allMergeSteps: MergeStep[] = [];
    const allEliminations: EliminationEvent[] = [];

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      // 1. Perform group-based merges for all glass types
      const mergeSteps = this.performGroupMerges(board);
      if (mergeSteps.length > 0) {
        allMergeSteps.push(...mergeSteps);
      }

      // 2. Check for eliminations
      const eliminations = this.performEliminations(board);
      if (eliminations.length > 0) {
        allEliminations.push(...eliminations);
      }

      // 3. If nothing changed, we're stable
      if (mergeSteps.length === 0 && eliminations.length === 0) {
        return { mergeSteps: allMergeSteps, eliminations: allEliminations, isStable: true };
      }
    }

    return { mergeSteps: allMergeSteps, eliminations: allEliminations, isStable: false };
  }

  /**
   * For each glass type, find connected groups of plates that contain that type,
   * then transfer all glasses of that type to the earliest plate in the group.
   */
  private performGroupMerges(board: IBoardState): MergeStep[] {
    const allSteps: MergeStep[] = [];

    // Collect all glass types present on the board
    const glassTypesOnBoard = new Set<GlassType>();
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const plate = board.getCell(r, c);
        if (!plate) continue;
        for (const g of plate.glasses) {
          glassTypesOnBoard.add(g);
        }
      }
    }

    // For each glass type, find connected groups and merge
    for (const glassType of glassTypesOnBoard) {
      const steps = this.mergeByType(board, glassType);
      allSteps.push(...steps);
    }

    return allSteps;
  }

  /**
   * For a specific glass type, find all connected groups of adjacent plates
   * that contain this type, then transfer to the earliest plate in each group.
   */
  private mergeByType(board: IBoardState, glassType: GlassType): MergeStep[] {
    const steps: MergeStep[] = [];
    const visited = new Set<string>();

    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const key = `${r},${c}`;
        if (visited.has(key)) continue;

        const plate = board.getCell(r, c);
        if (!plate || !plate.glasses.includes(glassType)) continue;

        // BFS to find all connected plates with this glass type
        const group: { pos: CellPosition; plate: Plate }[] = [];
        const queue: CellPosition[] = [{ row: r, col: c }];
        visited.add(key);

        while (queue.length > 0) {
          const pos = queue.shift()!;
          const p = board.getCell(pos.row, pos.col);
          if (!p) continue;

          group.push({ pos, plate: p });

          for (const nPos of board.getNeighbors(pos.row, pos.col)) {
            const nKey = `${nPos.row},${nPos.col}`;
            if (visited.has(nKey)) continue;
            const neighbor = board.getCell(nPos.row, nPos.col);
            if (!neighbor || !neighbor.glasses.includes(glassType)) continue;
            visited.add(nKey);
            queue.push(nPos);
          }
        }

        // Only merge if group has 2+ plates
        if (group.length < 2) continue;

        // Find the earliest plate in the group
        let earliest = group[0]!;
        for (let i = 1; i < group.length; i++) {
          const g = group[i]!;
          if ((g.plate.placedTimestamp ?? 0) < (earliest.plate.placedTimestamp ?? 0)) {
            earliest = g;
          }
        }

        // Transfer this glass type from all other plates to earliest
        for (const member of group) {
          if (member === earliest) continue;

          const sourceCount = member.plate.glasses.filter((g) => g === glassType).length;
          const currentTotal = earliest.plate.glasses.length;
          const transferCount = Math.min(sourceCount, 6 - currentTotal);

          if (transferCount <= 0) continue;

          // Remove from source
          let removed = 0;
          member.plate.glasses = member.plate.glasses.filter((g) => {
            if (g === glassType && removed < transferCount) {
              removed++;
              return false;
            }
            return true;
          });

          // Add to target
          for (let i = 0; i < transferCount; i++) {
            earliest.plate.glasses.push(glassType);
          }

          steps.push({
            sourcePos: member.pos,
            targetPos: earliest.pos,
            glassType,
            count: transferCount,
          });
        }
      }
    }

    return steps;
  }

  /**
   * Check all plates for elimination conditions and remove them.
   * - 0 glasses → eliminate (reason: 'empty')
   * - 6 glasses all same type → eliminate (reason: 'full_same_type')
   */
  private performEliminations(board: IBoardState): EliminationEvent[] {
    const eliminations: EliminationEvent[] = [];

    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const plate = board.getCell(r, c);
        if (!plate) continue;

        if (plate.glasses.length === 0) {
          eliminations.push({
            position: { row: r, col: c },
            plate: { ...plate, glasses: [...plate.glasses] },
            reason: 'empty',
          });
          board.setCell(r, c, null);
        } else if (
          plate.glasses.length === 6 &&
          plate.glasses.every((g) => g === plate.glasses[0])
        ) {
          eliminations.push({
            position: { row: r, col: c },
            plate: { ...plate, glasses: [...plate.glasses] },
            reason: 'full_same_type',
          });
          board.setCell(r, c, null);
        }
      }
    }

    return eliminations;
  }
}

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
 * 合并算法：扫描棋盘上所有相邻盘子对，将同类型酒杯转移到时间戳更早的盘子，
 * 然后检查消除条件，循环直到棋盘达到稳定态。
 */
export class MergeAlgorithm implements IMergeAlgorithm {
  resolveUntilStable(board: IBoardState): ResolutionResult {
    const allMergeSteps: MergeStep[] = [];
    const allEliminations: EliminationEvent[] = [];
    let isStable = true;

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const mergeSteps = this.performMerges(board);
      const eliminations = this.performEliminations(board);

      allMergeSteps.push(...mergeSteps);
      allEliminations.push(...eliminations);

      if (mergeSteps.length === 0 && eliminations.length === 0) {
        // No changes — board is stable
        return { mergeSteps: allMergeSteps, eliminations: allEliminations, isStable: true };
      }
    }

    // Hit max iterations — not truly stable
    isStable = false;
    return { mergeSteps: allMergeSteps, eliminations: allEliminations, isStable };
  }

  /**
   * Scan all adjacent plate pairs and transfer shared glass types
   * to the plate with the earlier placedTimestamp.
   */
  private performMerges(board: IBoardState): MergeStep[] {
    const steps: MergeStep[] = [];
    const visited = new Set<string>();

    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const plate = board.getCell(r, c);
        if (!plate) continue;

        const neighbors = board.getNeighbors(r, c);
        for (const nPos of neighbors) {
          // Avoid processing the same pair twice
          const pairKey = this.pairKey(r, c, nPos.row, nPos.col);
          if (visited.has(pairKey)) continue;
          visited.add(pairKey);

          const neighbor = board.getCell(nPos.row, nPos.col);
          if (!neighbor) continue;

          const pairSteps = this.mergePair(
            board,
            { row: r, col: c },
            plate,
            nPos,
            neighbor,
          );
          steps.push(...pairSteps);
        }
      }
    }

    return steps;
  }

  /**
   * For a pair of adjacent plates, find shared glass types and transfer
   * them to the plate with the earlier timestamp.
   */
  private mergePair(
    _board: IBoardState,
    posA: CellPosition,
    plateA: Plate,
    posB: CellPosition,
    plateB: Plate,
  ): MergeStep[] {
    const steps: MergeStep[] = [];

    // Determine target (earlier timestamp) and source (later timestamp)
    let targetPos: CellPosition;
    let sourcePos: CellPosition;
    let target: Plate;
    let source: Plate;

    if ((plateA.placedTimestamp ?? 0) <= (plateB.placedTimestamp ?? 0)) {
      target = plateA;
      targetPos = posA;
      source = plateB;
      sourcePos = posB;
    } else {
      target = plateB;
      targetPos = posB;
      source = plateA;
      sourcePos = posA;
    }

    // Find shared glass types
    const sharedTypes = this.getSharedGlassTypes(target, source);

    for (const glassType of sharedTypes) {
      const sourceCount = source.glasses.filter((g) => g === glassType).length;
      const targetTotal = target.glasses.length;
      const transferCount = Math.min(sourceCount, 6 - targetTotal);

      if (transferCount <= 0) continue;

      // Transfer: remove from source, add to target
      let removed = 0;
      source.glasses = source.glasses.filter((g) => {
        if (g === glassType && removed < transferCount) {
          removed++;
          return false;
        }
        return true;
      });

      for (let i = 0; i < transferCount; i++) {
        target.glasses.push(glassType);
      }

      steps.push({
        sourcePos,
        targetPos,
        glassType,
        count: transferCount,
      });
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

  /** Get glass types that exist in both plates */
  private getSharedGlassTypes(a: Plate, b: Plate): GlassType[] {
    const typesA = new Set(a.glasses);
    const typesB = new Set(b.glasses);
    const shared: GlassType[] = [];
    for (const t of typesA) {
      if (typesB.has(t)) {
        shared.push(t);
      }
    }
    return shared;
  }

  /** Create a canonical key for a pair of positions (order-independent) */
  private pairKey(r1: number, c1: number, r2: number, c2: number): string {
    if (r1 < r2 || (r1 === r2 && c1 < c2)) {
      return `${r1},${c1}-${r2},${c2}`;
    }
    return `${r2},${c2}-${r1},${c1}`;
  }
}

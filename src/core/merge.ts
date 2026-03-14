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

const MAX_DEPTH = 20;

/**
 * 合并算法 - 吸收模型
 *
 * 核心流程：
 * 1. 从新放置的盘子出发，构建参与组（邻居中与类型并集有交集的盘子）
 * 2. 吸收阶段：按时间戳升序，每个盘子选择一种共享类型吸收，其他类型挤出到剩余池
 * 3. 剩余分配：剩余池中的酒杯填入参与组内有空位的盘子
 * 4. 消除：空盘消除、满盘消除
 * 5. 连锁：接收了剩余分配的盘子视为新盘子，递归执行合并
 */
export class MergeAlgorithm implements IMergeAlgorithm {
  resolve(board: IBoardState, placedPos: CellPosition): ResolutionResult {
    const allSteps: MergeStep[] = [];
    const allEliminations: EliminationEvent[] = [];

    this.resolveFrom(board, [placedPos], allSteps, allEliminations, 0);

    return {
      mergeSteps: allSteps,
      eliminations: allEliminations,
      isStable: true,
    };
  }

  /**
   * 从一组"触发点"出发执行合并。每个触发点视为新放置的盘子。
   */
  private resolveFrom(
    board: IBoardState,
    triggers: CellPosition[],
    allSteps: MergeStep[],
    allEliminations: EliminationEvent[],
    depth: number,
  ): void {
    if (depth >= MAX_DEPTH) return;

    const processed = new Set<string>();

    for (const pos of triggers) {
      const key = `${pos.row},${pos.col}`;
      if (processed.has(key)) continue;
      processed.add(key);

      const plate = board.getCell(pos.row, pos.col);
      if (!plate || plate.glasses.length === 0) continue;

      // 1. 构建参与组
      const group = this.buildGroup(board, pos);
      if (group.length < 2) continue;

      // 标记参与组成员已处理
      for (const m of group) {
        processed.add(`${m.pos.row},${m.pos.col}`);
      }

      // 2. 吸收 + 剩余分配
      const { steps, residualReceivers } = this.absorbAndDistribute(group);
      allSteps.push(...steps);

      // 3. 消除
      const eliminations = this.eliminateGroup(board, group);
      allEliminations.push(...eliminations);

      // 4. 连锁：接收了剩余分配且未被消除的盘子，递归
      const eliminatedKeys = new Set(
        eliminations.map(e => `${e.position.row},${e.position.col}`),
      );
      const nextTriggers = residualReceivers.filter(
        p => !eliminatedKeys.has(`${p.row},${p.col}`),
      );
      if (nextTriggers.length > 0) {
        this.resolveFrom(board, nextTriggers, allSteps, allEliminations, depth + 1);
      }
    }
  }

  /**
   * 构建参与组：从新盘子出发，候选范围 = 新盘子的邻居。
   * 用类型并集迭代匹配：只要邻居与当前参与组的类型并集有交集，就拉进来。
   */
  private buildGroup(
    board: IBoardState,
    center: CellPosition,
  ): { pos: CellPosition; plate: Plate }[] {
    const centerPlate = board.getCell(center.row, center.col);
    if (!centerPlate) return [];

    const group: { pos: CellPosition; plate: Plate }[] = [
      { pos: center, plate: centerPlate },
    ];

    // 候选：center 的所有邻居
    const candidates: { pos: CellPosition; plate: Plate }[] = [];
    for (const nPos of board.getNeighbors(center.row, center.col)) {
      const neighbor = board.getCell(nPos.row, nPos.col);
      if (neighbor && neighbor.glasses.length > 0) {
        candidates.push({ pos: nPos, plate: neighbor });
      }
    }

    // 类型并集
    const typePool = new Set<GlassType>(centerPlate.glasses);

    let changed = true;
    while (changed) {
      changed = false;
      for (let i = candidates.length - 1; i >= 0; i--) {
        const cand = candidates[i]!;
        let shared = false;
        for (const g of cand.plate.glasses) {
          if (typePool.has(g)) { shared = true; break; }
        }
        if (shared) {
          group.push(cand);
          for (const g of cand.plate.glasses) typePool.add(g);
          candidates.splice(i, 1);
          changed = true;
        }
      }
    }

    return group;
  }

  /**
   * 吸收 + 剩余分配。
   *
   * 吸收阶段：按时间戳升序，每个盘子选择一种共享类型吸收。
   * 吸收 = 清空自己，非吸收类型挤出到剩余池，然后从组内各盘子+剩余池拿走所有该类型（上限6），溢出进剩余池。
   *
   * 剩余分配：剩余池中的酒杯按数量降序，填入参与组内有空位的盘子（空位最多优先）。
   */
  private absorbAndDistribute(
    group: { pos: CellPosition; plate: Plate }[],
  ): { steps: MergeStep[]; residualReceivers: CellPosition[] } {
    if (group.length < 2) return { steps: [], residualReceivers: [] };

    // 记录分配前状态
    const before = new Map<string, GlassType[]>();
    for (const m of group) {
      before.set(`${m.pos.row},${m.pos.col}`, [...m.plate.glasses]);
    }

    // 找出共享类型（参与组内 2+ 个盘子持有的类型）
    const typeOwners = new Map<GlassType, number>();
    for (const m of group) {
      const seen = new Set<GlassType>();
      for (const g of m.plate.glasses) {
        if (!seen.has(g)) {
          seen.add(g);
          typeOwners.set(g, (typeOwners.get(g) ?? 0) + 1);
        }
      }
    }
    const sharedTypes = new Set<GlassType>();
    for (const [type, count] of typeOwners) {
      if (count >= 2) sharedTypes.add(type);
    }

    // 如果没有共享类型，不需要合并
    if (sharedTypes.size === 0) return { steps: [], residualReceivers: [] };

    // 统计每种共享类型在参与组内的总数量
    const sharedTypeCounts = new Map<GlassType, number>();
    for (const t of sharedTypes) sharedTypeCounts.set(t, 0);
    for (const m of group) {
      for (const g of m.plate.glasses) {
        if (sharedTypes.has(g)) {
          sharedTypeCounts.set(g, sharedTypeCounts.get(g)! + 1);
        }
      }
    }

    // 按时间戳升序排列
    const sorted = [...group].sort(
      (a, b) => (a.plate.placedTimestamp ?? 0) - (b.plate.placedTimestamp ?? 0),
    );

    // 剩余池
    const residualPool = new Map<GlassType, number>();

    // 已被吸收的类型
    const absorbedTypes = new Set<GlassType>();

    // 吸收阶段
    for (const m of sorted) {
      // 选择该盘子原有的、未被吸收的共享类型中数量最多的
      const myTypes = new Set<GlassType>(m.plate.glasses);
      let bestType: GlassType | null = null;
      let bestCount = 0;
      for (const t of myTypes) {
        if (!sharedTypes.has(t) || absorbedTypes.has(t)) continue;
        const total = (sharedTypeCounts.get(t) ?? 0) + (residualPool.get(t) ?? 0);
        if (total > bestCount) {
          bestCount = total;
          bestType = t;
        }
      }

      if (bestType === null) continue;

      absorbedTypes.add(bestType);

      // 清空自己，非吸收类型挤出到剩余池
      for (const g of m.plate.glasses) {
        if (g !== bestType) {
          residualPool.set(g, (residualPool.get(g) ?? 0) + 1);
        }
      }
      // 自己的吸收类型数量
      const myAbsorbCount = m.plate.glasses.filter(g => g === bestType).length;
      m.plate.glasses = [];

      // 从其他盘子拿走该类型
      let totalCollected = myAbsorbCount;
      for (const other of group) {
        if (other === m) continue;
        const kept: GlassType[] = [];
        for (const g of other.plate.glasses) {
          if (g === bestType) {
            totalCollected++;
          } else {
            kept.push(g);
          }
        }
        other.plate.glasses = kept;
      }

      // 从剩余池拿走该类型
      const fromPool = residualPool.get(bestType) ?? 0;
      totalCollected += fromPool;
      residualPool.delete(bestType);

      // 填入吸收盘子（上限6）
      const fill = Math.min(totalCollected, 6);
      for (let i = 0; i < fill; i++) {
        m.plate.glasses.push(bestType);
      }
      // 溢出进剩余池
      const overflow = totalCollected - fill;
      if (overflow > 0) {
        residualPool.set(bestType, (residualPool.get(bestType) ?? 0) + overflow);
      }
    }

    // 剩余分配
    const residualReceivers: CellPosition[] = [];
    const remaining = [...residualPool.entries()]
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);

    for (const [type, count] of remaining) {
      let left = count;
      // 按空位降序排列
      const byCapacity = [...sorted].sort((a, b) => {
        const capA = 6 - a.plate.glasses.length;
        const capB = 6 - b.plate.glasses.length;
        if (capB !== capA) return capB - capA;
        return (a.plate.placedTimestamp ?? 0) - (b.plate.placedTimestamp ?? 0);
      });
      for (const m of byCapacity) {
        if (left <= 0) break;
        const capacity = 6 - m.plate.glasses.length;
        if (capacity <= 0) continue;
        const fill = Math.min(left, capacity);
        for (let i = 0; i < fill; i++) {
          m.plate.glasses.push(type);
        }
        left -= fill;
        residualReceivers.push(m.pos);
      }
    }

    // 去重 residualReceivers
    const seen = new Set<string>();
    const uniqueReceivers = residualReceivers.filter(p => {
      const k = `${p.row},${p.col}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const steps = this.diffToSteps(group, before);
    return { steps, residualReceivers: uniqueReceivers };
  }

  /** 对参与组内的盘子执行消除检查 */
  private eliminateGroup(
    board: IBoardState,
    group: { pos: CellPosition; plate: Plate }[],
  ): EliminationEvent[] {
    const eliminations: EliminationEvent[] = [];
    for (const m of group) {
      const plate = board.getCell(m.pos.row, m.pos.col);
      if (!plate) continue;
      if (plate.glasses.length === 0) {
        eliminations.push({
          position: m.pos,
          plate: { ...plate, glasses: [...plate.glasses] },
          reason: 'empty',
        });
        board.setCell(m.pos.row, m.pos.col, null);
      } else if (
        plate.glasses.length === 6 &&
        plate.glasses.every(g => g === plate.glasses[0])
      ) {
        eliminations.push({
          position: m.pos,
          plate: { ...plate, glasses: [...plate.glasses] },
          reason: 'full_same_type',
        });
        board.setCell(m.pos.row, m.pos.col, null);
      }
    }
    return eliminations;
  }

  /** 对比分配前后的酒杯变化，生成 MergeStep */
  private diffToSteps(
    group: { pos: CellPosition; plate: Plate }[],
    before: Map<string, GlassType[]>,
  ): MergeStep[] {
    const steps: MergeStep[] = [];
    const after = new Map<string, { pos: CellPosition; glasses: GlassType[] }>();
    for (const m of group) {
      after.set(`${m.pos.row},${m.pos.col}`, { pos: m.pos, glasses: [...m.plate.glasses] });
    }

    for (const m of group) {
      const key = `${m.pos.row},${m.pos.col}`;
      const oldGlasses = before.get(key)!;
      const newGlasses = after.get(key)!.glasses;

      const oldCount = new Map<GlassType, number>();
      const newCount = new Map<GlassType, number>();
      for (const g of oldGlasses) oldCount.set(g, (oldCount.get(g) ?? 0) + 1);
      for (const g of newGlasses) newCount.set(g, (newCount.get(g) ?? 0) + 1);

      for (const [type, cnt] of oldCount) {
        const diff = cnt - (newCount.get(type) ?? 0);
        if (diff > 0) {
          for (const other of group) {
            const oKey = `${other.pos.row},${other.pos.col}`;
            if (oKey === key) continue;
            const oBefore = new Map<GlassType, number>();
            const oAfter = new Map<GlassType, number>();
            for (const g of before.get(oKey)!) oBefore.set(g, (oBefore.get(g) ?? 0) + 1);
            for (const g of after.get(oKey)!.glasses) oAfter.set(g, (oAfter.get(g) ?? 0) + 1);
            const gained = (oAfter.get(type) ?? 0) - (oBefore.get(type) ?? 0);
            if (gained > 0) {
              steps.push({
                sourcePos: m.pos,
                targetPos: other.pos,
                glassType: type,
                count: Math.min(diff, gained),
              });
              break;
            }
          }
        }
      }
    }
    return steps;
  }
}

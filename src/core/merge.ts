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

const MAX_ITERATIONS = 100;

/**
 * 合并算法 - 局部参与组策略
 *
 * 核心规则：
 * 1. 扫描棋盘，对每个盘子 P，检查它与相邻盘子是否有共同酒杯类型
 * 2. 如果没有 → 跳过
 * 3. 如果有 → P + 所有相邻盘子组成"参与组"
 * 4. 参与组内所有酒杯按类型归类，每种类型尽量集中到一个盘子
 * 5. 盘子按时间戳升序排列，类型按数量降序排列
 *    最早的盘子承载最多的类型，依次分配
 *    如果类型数 > 盘子数，最后一个盘子承载剩余所有类型
 * 6. 空盘消除，6个同类型满盘消除
 * 7. 消除后继续迭代直到稳定
 */
export class MergeAlgorithm implements IMergeAlgorithm {
  resolveUntilStable(board: IBoardState): ResolutionResult {
    const allMergeSteps: MergeStep[] = [];
    const allEliminations: EliminationEvent[] = [];

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const { steps, eliminations } = this.performOnePass(board);
      allMergeSteps.push(...steps);
      allEliminations.push(...eliminations);

      if (steps.length === 0 && eliminations.length === 0) {
        return {
          mergeSteps: allMergeSteps,
          eliminations: allEliminations,
          isStable: true,
        };
      }
    }

    return {
      mergeSteps: allMergeSteps,
      eliminations: allEliminations,
      isStable: false,
    };
  }

  /**
   * 一轮扫描：找到所有可合并的参与组，执行重分配，然后消除。
   */
  private performOnePass(board: IBoardState): {
    steps: MergeStep[];
    eliminations: EliminationEvent[];
  } {
    const steps: MergeStep[] = [];
    const processed = new Set<string>();

    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const key = `${r},${c}`;
        if (processed.has(key)) continue;
        const plate = board.getCell(r, c);
        if (!plate || plate.glasses.length === 0) continue;

        // 用迭代式 BFS 构建参与组
        const group = this.buildMergeGroup(board, { row: r, col: c });

        // 至少需要 2 个盘子才能合并
        if (group.length < 2) continue;

        // 标记已处理
        for (const member of group) {
          processed.add(`${member.pos.row},${member.pos.col}`);
        }

        // 执行重分配
        const groupSteps = this.redistributeGroup(group);
        steps.push(...groupSteps);
      }
    }

    const eliminations = this.performEliminations(board);
    return { steps, eliminations };
  }

  /**
   * 迭代式 BFS 构建参与组：
   * 1. 从起始盘子出发，检查相邻盘子是否与组内任何成员有共同类型
   * 2. 如果有，纳入组，并重新检查新成员的邻居
   * 3. 重复直到没有新成员加入
   *
   * 这样可以处理"A-B-C"场景：A 和 C 有共同类型但 B 没有，
   * 只要 A 和 B 相邻且有共同类型，B 加入后 C 作为 B 的邻居
   * 会被检查是否与组内（A 或 B）有共同类型。
   */
  private buildMergeGroup(
    board: IBoardState,
    start: CellPosition,
  ): { pos: CellPosition; plate: Plate }[] {
    const startPlate = board.getCell(start.row, start.col);
    if (!startPlate) return [];

    const group: { pos: CellPosition; plate: Plate }[] = [
      { pos: start, plate: startPlate },
    ];
    const inGroup = new Set<string>([`${start.row},${start.col}`]);

    // 收集组内所有酒杯类型（用于快速判断共同类型）
    const groupTypes = new Set<GlassType>(startPlate.glasses);

    let changed = true;
    while (changed) {
      changed = false;
      // 遍历当前组内所有成员的邻居
      for (let gi = 0; gi < group.length; gi++) {
        const member = group[gi]!;
        for (const nPos of board.getNeighbors(member.pos.row, member.pos.col)) {
          const nKey = `${nPos.row},${nPos.col}`;
          if (inGroup.has(nKey)) continue;
          const neighbor = board.getCell(nPos.row, nPos.col);
          if (!neighbor || neighbor.glasses.length === 0) continue;

          // 检查邻居是否与组内有共同类型
          let shared = false;
          for (const g of neighbor.glasses) {
            if (groupTypes.has(g)) { shared = true; break; }
          }
          if (shared) {
            inGroup.add(nKey);
            group.push({ pos: nPos, plate: neighbor });
            for (const g of neighbor.glasses) {
              groupTypes.add(g);
            }
            changed = true;
          }
        }
      }
    }

    return group;
  }

  /**
   * 对参与组执行重分配：
   * 1. 收集所有酒杯，按类型统计
   * 2. 盘子按时间戳升序（早的优先）
   * 3. 类型按数量降序（多的优先），数量相同按类型编号升序
   * 4. 依次分配：最早盘子←最多类型，第二早←第二多...
   * 5. 如果类型数 > 盘子数，最后一个盘子承载剩余所有类型
   * 6. 每个盘子最多 6 个酒杯
   */
  private redistributeGroup(
    group: { pos: CellPosition; plate: Plate }[],
  ): MergeStep[] {
    if (group.length < 2) return [];

    const steps: MergeStep[] = [];

    // 1. 统计所有酒杯
    const typeCounts = new Map<GlassType, number>();
    for (const m of group) {
      for (const g of m.plate.glasses) {
        typeCounts.set(g, (typeCounts.get(g) ?? 0) + 1);
      }
    }

    // 2. 类型按数量降序，相同数量按类型编号升序
    const sortedTypes = [...typeCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0]);

    // 3. 盘子按时间戳升序
    const sortedPlates = [...group]
      .sort((a, b) =>
        (a.plate.placedTimestamp ?? 0) - (b.plate.placedTimestamp ?? 0));

    // 4. 记录原始状态
    const originalGlasses = new Map<string, GlassType[]>();
    for (const m of group) {
      originalGlasses.set(`${m.pos.row},${m.pos.col}`, [...m.plate.glasses]);
    }

    // 5. 分配酒杯到盘子
    const assignment = new Map<string, GlassType[]>();
    for (const m of sortedPlates) {
      assignment.set(`${m.pos.row},${m.pos.col}`, []);
    }

    for (let i = 0; i < sortedTypes.length; i++) {
      const [glassType, count] = sortedTypes[i]!;
      // 分配到第 i 个盘子，如果 i >= 盘子数则分配到最后一个
      const targetIdx = Math.min(i, sortedPlates.length - 1);
      const target = sortedPlates[targetIdx]!;
      const key = `${target.pos.row},${target.pos.col}`;
      const glasses = assignment.get(key)!;
      const toAdd = Math.min(count, 6 - glasses.length);
      for (let j = 0; j < toAdd; j++) {
        glasses.push(glassType);
      }
    }

    // 6. 应用分配，生成 MergeStep
    for (const member of sortedPlates) {
      const key = `${member.pos.row},${member.pos.col}`;
      const newGlasses = assignment.get(key)!;
      const oldGlasses = originalGlasses.get(key)!;

      const oldCounts = countTypes(oldGlasses);
      const newCounts = countTypes(newGlasses);

      // 记录新增的酒杯来源
      for (const [type, newCount] of newCounts) {
        const oldCount = oldCounts.get(type) ?? 0;
        const gained = newCount - oldCount;
        if (gained <= 0) continue;

        let remaining = gained;
        for (const source of sortedPlates) {
          if (remaining <= 0) break;
          if (source === member) continue;
          const srcKey = `${source.pos.row},${source.pos.col}`;
          const srcOld = countTypes(originalGlasses.get(srcKey)!);
          const srcNew = countTypes(assignment.get(srcKey)!);
          const lost = (srcOld.get(type) ?? 0) - (srcNew.get(type) ?? 0);
          if (lost > 0) {
            const transfer = Math.min(remaining, lost);
            steps.push({
              sourcePos: source.pos,
              targetPos: member.pos,
              glassType: type,
              count: transfer,
            });
            remaining -= transfer;
          }
        }
      }

      member.plate.glasses = newGlasses;
    }

    return steps;
  }

  /**
   * 消除检查：
   * - 0 个酒杯 → 空盘消除
   * - 6 个同类型酒杯 → 满盘消除
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

/** 统计酒杯类型数量 */
function countTypes(glasses: GlassType[]): Map<GlassType, number> {
  const counts = new Map<GlassType, number>();
  for (const g of glasses) {
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return counts;
}

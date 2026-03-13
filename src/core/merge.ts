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
 * 3. 如果有 → P + 通过直接相邻共同类型连通的盘子组成"参与组"
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
   * 1. 从起始盘子出发，检查相邻盘子是否与其直接相邻的组内成员有共同类型
   * 2. 如果有，纳入组，并重新检查新成员的邻居
   * 3. 重复直到没有新成员加入
   *
   * 关键：邻居必须与其直接相邻的组内成员有共同类型才能纳入，
   * 而不是与整个组的类型集合比较。这防止了类型通过中间盘子
   * "传播"到不相关的远端盘子。
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

    let changed = true;
    while (changed) {
      changed = false;
      for (let gi = 0; gi < group.length; gi++) {
        const member = group[gi]!;
        const memberTypes = new Set<GlassType>(member.plate.glasses);
        for (const nPos of board.getNeighbors(member.pos.row, member.pos.col)) {
          const nKey = `${nPos.row},${nPos.col}`;
          if (inGroup.has(nKey)) continue;
          const neighbor = board.getCell(nPos.row, nPos.col);
          if (!neighbor || neighbor.glasses.length === 0) continue;

          // 检查邻居是否与这个直接相邻的组内成员有共同类型
          let shared = false;
          for (const g of neighbor.glasses) {
            if (memberTypes.has(g)) { shared = true; break; }
          }
          if (shared) {
            inGroup.add(nKey);
            group.push({ pos: nPos, plate: neighbor });
            changed = true;
          }
        }
      }
    }

    return group;
  }

  /**
   * 对参与组执行共同类型定向转移 + 非共同类型回推：
   * 1. 收集组内所有相邻盘子对
   * 2. 对每对相邻盘子（新→老方向）：
   *    a. 共同类型的酒杯从新盘子转移到老盘子（不超过6上限）
   *    b. 老盘子上的非共同类型酒杯推回给新盘子（不超过6上限）
   * 3. 这样每个盘子趋向单一类型化
   *
   * 按时间戳差从大到小处理（最新→最老的对优先）。
   */
  private redistributeGroup(
    group: { pos: CellPosition; plate: Plate }[],
  ): MergeStep[] {
    if (group.length < 2) return [];

    const steps: MergeStep[] = [];

    // 收集组内所有相邻盘子对（去重）
    const pairs: [typeof group[0], typeof group[0]][] = [];
    const pairSet = new Set<string>();
    for (const m of group) {
      for (const other of group) {
        if (m === other) continue;
        const k1 = `${m.pos.row},${m.pos.col}`;
        const k2 = `${other.pos.row},${other.pos.col}`;
        const pairKey = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
        if (pairSet.has(pairKey)) continue;
        if (Math.abs(m.pos.row - other.pos.row) + Math.abs(m.pos.col - other.pos.col) !== 1) continue;
        pairSet.add(pairKey);
        pairs.push([m, other]);
      }
    }

    // 按时间戳差从大到小排序
    pairs.sort((a, b) => {
      const diffA = Math.abs((a[0].plate.placedTimestamp ?? 0) - (a[1].plate.placedTimestamp ?? 0));
      const diffB = Math.abs((b[0].plate.placedTimestamp ?? 0) - (b[1].plate.placedTimestamp ?? 0));
      return diffB - diffA;
    });

    for (const [a, b] of pairs) {
      const tsA = a.plate.placedTimestamp ?? 0;
      const tsB = b.plate.placedTimestamp ?? 0;
      if (tsA === tsB) continue;
      const source = tsA > tsB ? a : b; // 较新
      const target = tsA > tsB ? b : a; // 较老

      const targetTypes = new Set(target.plate.glasses);
      const sharedTypes = new Set<GlassType>();
      for (const g of source.plate.glasses) {
        if (targetTypes.has(g)) sharedTypes.add(g);
      }
      if (sharedTypes.size === 0) continue;

      // Step 1: 共同类型从 source → target
      for (const type of sharedTypes) {
        const count = transferGlasses(source.plate, target.plate, type);
        if (count > 0) {
          steps.push({ sourcePos: source.pos, targetPos: target.pos, glassType: type, count });
        }
      }

      // Step 2: target 上的非共同类型推回 source
      const nonSharedTypes = new Set<GlassType>();
      for (const g of target.plate.glasses) {
        if (!sharedTypes.has(g)) nonSharedTypes.add(g);
      }
      for (const type of nonSharedTypes) {
        const count = transferGlasses(target.plate, source.plate, type);
        if (count > 0) {
          steps.push({ sourcePos: target.pos, targetPos: source.pos, glassType: type, count });
        }
      }
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


/**
 * 将 from 盘子中指定类型的所有酒杯转移到 to 盘子（不超过6上限）。
 * 直接修改两个盘子的 glasses 数组，返回实际转移数量。
 */
function transferGlasses(from: Plate, to: Plate, type: GlassType): number {
  const indices: number[] = [];
  for (let i = 0; i < from.glasses.length; i++) {
    if (from.glasses[i] === type) indices.push(i);
  }
  const capacity = 6 - to.glasses.length;
  const count = Math.min(indices.length, capacity);
  if (count <= 0) return 0;

  const toRemove = indices.slice(0, count);
  for (let i = toRemove.length - 1; i >= 0; i--) {
    from.glasses.splice(toRemove[i]!, 1);
  }
  for (let i = 0; i < count; i++) {
    to.glasses.push(type);
  }
  return count;
}

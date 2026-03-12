// ============================================================
// 心动的生活 - 核心类型与接口定义
// ============================================================

// --- 基础类型 ---

/** 酒杯类型（用数字表示，0 到 glassTypeCount-1） */
export type GlassType = number;

/** 棋盘格子（可以是盘子或空） */
export type Cell = Plate | null;

// --- 数据模型 ---

/** 盘子 */
export interface Plate {
  /** 唯一标识 */
  id: string;
  /** 当前酒杯列表（长度 0~6） */
  glasses: GlassType[];
  /** 放置时间戳，null 表示尚未放置 */
  placedTimestamp: number | null;
}

/** 棋盘 */
export interface Board {
  rows: number;
  cols: number;
  /** rows × cols 二维数组 */
  cells: Cell[][];
}

/** 格子坐标 */
export interface CellPosition {
  row: number;
  col: number;
}

// --- 游戏状态 ---

/** 游戏完整状态 */
export interface GameState {
  board: Board;
  /** 临时摆放区（长度为 platesPerRound，默认 3） */
  stagingArea: (Plate | null)[];
  score: number;
  /** 当前 move 的 combo 计数 */
  combo: number;
  /** 当前轮次 */
  round: number;
  /** 当前轮满盘消除计数 */
  roundEliminations: number;
  /** 当前目标酒杯类型列表 */
  targetGlasses: GlassType[];
  /** 累计满盘消除数（用于目标酒杯刷新） */
  totalFullEliminations: number;
  /** 当前选中的临时区盘子索引 */
  selectedPlateIndex: number | null;
  /** 游戏是否结束 */
  gameOver: boolean;
}

// --- 操作结果 ---

/** 放置操作结果 */
export interface PlacementResult {
  success: boolean;
  mergeSteps: MergeStep[];
  eliminations: EliminationEvent[];
  scoreGained: number;
  comboCount: number;
  roundBonuses: number;
}

/** 合并步骤 */
export interface MergeStep {
  sourcePos: CellPosition;
  targetPos: CellPosition;
  glassType: GlassType;
  count: number;
}

/** 消除事件 */
export interface EliminationEvent {
  position: CellPosition;
  plate: Plate;
  reason: 'full_same_type' | 'empty';
}

/** 合并-消除解析结果 */
export interface ResolutionResult {
  mergeSteps: MergeStep[];
  eliminations: EliminationEvent[];
  isStable: boolean;
}

// --- 配置 ---

/** 单轮额外奖励配置 */
export interface RoundBonus {
  /** 满盘消除数阈值 */
  threshold: number;
  /** 奖励分数 */
  bonus: number;
}

/** 游戏配置 */
export interface GameConfig {
  /** 棋盘行数，默认 6 */
  boardRows: number;
  /** 棋盘列数，默认 4 */
  boardCols: number;
  /** 酒杯种类数量，默认 8 */
  glassTypeCount: number;
  /** 新盘子最少酒杯数，默认 1 */
  minGlassesPerPlate: number;
  /** 新盘子最多酒杯数，默认 4 */
  maxGlassesPerPlate: number;
  /** 每个盘子的槽位数，固定 6 */
  slotsPerPlate: number;
  /** 每轮发放盘子数，固定 3 */
  platesPerRound: number;
  /** 目标酒杯数量 m，默认 2 */
  targetGlassCount: number;
  /** 目标酒杯刷新阈值，默认 10 */
  targetGlassRefreshThreshold: number;
  /** 单轮额外奖励配置 */
  roundBonuses: RoundBonus[];
}

// --- 接口定义 ---

/** 游戏引擎接口 */
export interface IGameEngine {
  /** 开始游戏 */
  start(): void;
  /** 重置游戏 */
  reset(): void;
  /** 选择临时区盘子 */
  selectPlate(index: number): void;
  /** 放置盘子到指定格子 */
  placePlate(row: number, col: number): PlacementResult;
  /** 获取当前游戏状态 */
  getState(): GameState;
  /** 判断游戏是否结束 */
  isGameOver(): boolean;
}

/** 棋盘状态接口 */
export interface IBoardState {
  readonly rows: number;
  readonly cols: number;
  getCell(row: number, col: number): Cell;
  setCell(row: number, col: number, plate: Plate | null): void;
  isEmpty(row: number, col: number): boolean;
  getNeighbors(row: number, col: number): CellPosition[];
  hasEmptyCell(): boolean;
  clone(): IBoardState;
}

/** 合并算法接口 */
export interface IMergeAlgorithm {
  resolveUntilStable(board: IBoardState): ResolutionResult;
}

/** 得分计算接口 */
export interface IScoreCalculator {
  calculateEliminationScore(
    event: EliminationEvent,
    comboIndex: number,
    targetGlasses: GlassType[]
  ): number;

  calculateRoundBonus(
    roundEliminations: number,
    config: GameConfig
  ): number;
}

/** 盘子生成器接口 */
export interface IPlateGenerator {
  generatePlates(count: number): Plate[];
}

/** 渲染器接口 */
export interface IRenderer {
  init(container: HTMLElement): void;
  destroy(): void;
  renderState(state: GameState): void;
  animateMerge(steps: MergeStep[]): Promise<void>;
  animateElimination(events: EliminationEvent[]): Promise<void>;
  animateScoreChange(oldScore: number, newScore: number): Promise<void>;
  resize(): void;
}

/** 输入处理器接口 */
export interface IInputHandler {
  init(element: HTMLElement): void;
  destroy(): void;
  onCellClick(callback: (row: number, col: number) => void): void;
  onStagingClick(callback: (index: number) => void): void;
}

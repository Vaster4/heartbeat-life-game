import type {
  CellPosition,
  GameConfig,
  GameState,
  GlassType,
  IGameEngine,
  Obstacle,
  Plate,
  PlacementResult,
} from '../types';
import { createConfig } from './config';
import { BoardState } from './board';
import { PlateGenerator, type RandomFn } from './plate-generator';
import { MergeAlgorithm } from './merge';
import { ScoreCalculator } from './score';
import { GameLogger } from './logger';

export class GameEngine implements IGameEngine {
  private readonly config: GameConfig;
  private board: BoardState;
  private readonly plateGenerator: PlateGenerator;
  private readonly mergeAlgorithm: MergeAlgorithm;
  private readonly scoreCalculator: ScoreCalculator;
  private readonly random: RandomFn;
  readonly logger: GameLogger;

  private stagingArea: (Plate | null)[] = [];
  private score = 0;
  private combo = 0;
  private round = 0;
  private roundEliminations = 0;
  private roundBonusAwarded = 0;
  private targetGlasses: GlassType[] = [];
  private totalFullEliminations = 0;
  private selectedPlateIndex: number | null = null;
  private gameOver = false;
  private placementCounter = 0;

  /** 当前目标酒杯刷新阈值（动态增长） */
  private targetRefreshThreshold: number;
  /** 当前已解锁的酒杯类型数 */
  private unlockedGlassTypes: number;

  constructor(config?: Partial<GameConfig>, random: RandomFn = Math.random) {
    this.config = createConfig(config);
    this.random = random;
    this.board = new BoardState(this.config.boardRows, this.config.boardCols);
    this.plateGenerator = new PlateGenerator(this.config, random);
    this.mergeAlgorithm = new MergeAlgorithm();
    this.scoreCalculator = new ScoreCalculator();
    this.logger = new GameLogger();
    this.targetRefreshThreshold = this.config.targetGlassRefreshThreshold;
    this.unlockedGlassTypes = this.config.initialGlassTypes;
  }

  start(): void {
    this.logger.clear();
    this.board = new BoardState(this.config.boardRows, this.config.boardCols);
    this.score = 0;
    this.combo = 0;
    this.round = 1;
    this.roundEliminations = 0;
    this.roundBonusAwarded = 0;
    this.totalFullEliminations = 0;
    this.selectedPlateIndex = null;
    this.gameOver = false;
    this.placementCounter = 0;
    this.targetRefreshThreshold = this.config.targetGlassRefreshThreshold;
    this.unlockedGlassTypes = this.config.initialGlassTypes;

    this.targetGlasses = this.selectTargetGlasses();
    this.logger.info('GAME', `游戏开始 | 棋盘 ${this.config.boardRows}×${this.config.boardCols} | 目标酒杯: [${this.targetGlasses.join(', ')}] | 解锁类型: ${this.unlockedGlassTypes}`);

    // 放置初始障碍石
    this.placeInitialObstacles();

    this.generateNewRound();
  }

  reset(): void {
    this.start();
  }

  selectPlate(index: number): void {
    if (index < 0 || index >= this.stagingArea.length) return;
    if (this.stagingArea[index] === null) return;
    this.selectedPlateIndex = index;
    const plate = this.stagingArea[index]!;
    this.logger.debug('SELECT', `选中临时区盘子 #${index} | id=${plate.id} | 酒杯: [${plate.glasses.join(', ')}]`);
  }

  placePlate(row: number, col: number): PlacementResult {
    const fail: PlacementResult = {
      success: false, mergeSteps: [], eliminations: [],
      scoreGained: 0, comboCount: 0, roundBonuses: 0,
    };

    if (this.selectedPlateIndex === null) return fail;
    if (row < 0 || row >= this.config.boardRows || col < 0 || col >= this.config.boardCols) return fail;
    if (!this.board.isPlaceable(row, col)) return fail;

    const plate = this.stagingArea[this.selectedPlateIndex];
    if (!plate) return fail;

    this.combo = 0;
    plate.placedTimestamp = ++this.placementCounter;
    this.board.setCell(row, col, plate);
    this.stagingArea[this.selectedPlateIndex] = null;
    this.selectedPlateIndex = null;

    this.logger.info('PLACE', `放置盘子 id=${plate.id} 到 (${row},${col}) | ts=${plate.placedTimestamp} | 酒杯: [${plate.glasses.join(', ')}]`);
    this.logger.dump('放置后/合并前', this.board.rows, this.board.cols, (r, c) => this.board.getCell(r, c));

    const resolution = this.mergeAlgorithm.resolve(this.board, { row, col });

    let scoreGained = 0;

    for (const step of resolution.mergeSteps) {
      this.logger.info('MERGE', `合并: (${step.sourcePos.row},${step.sourcePos.col}) → (${step.targetPos.row},${step.targetPos.col}) | 类型=${step.glassType} × ${step.count}`);
    }

    // 收集满6消除的位置，用于破除障碍石封印
    const fullElimPositions: CellPosition[] = [];

    for (const elim of resolution.eliminations) {
      if (elim.reason === 'full_same_type') {
        this.combo++;
        const points = this.scoreCalculator.calculateEliminationScore(elim, this.combo, this.targetGlasses);
        scoreGained += points;
        this.roundEliminations++;
        this.totalFullEliminations++;
        fullElimPositions.push(elim.position);
        this.logger.info('ELIM', `满盘消除: (${elim.position.row},${elim.position.col}) | 类型=${elim.plate.glasses[0]} | combo=${this.combo} | +${points}分`);
      } else {
        this.logger.info('ELIM', `空盘消除: (${elim.position.row},${elim.position.col})`);
      }
    }

    if (resolution.mergeSteps.length > 0 || resolution.eliminations.length > 0) {
      this.logger.dump('合并/消除后', this.board.rows, this.board.cols, (r, c) => this.board.getCell(r, c));
    }

    this.score += scoreGained;

    // 处理障碍石封印破除
    const obstacleScore = this.processObstacleBreaking(fullElimPositions);
    scoreGained += obstacleScore;
    this.score += obstacleScore;

    // 目标酒杯刷新
    if (this.totalFullEliminations >= this.targetRefreshThreshold) {
      this.totalFullEliminations -= this.targetRefreshThreshold;
      this.targetRefreshThreshold += this.config.targetRefreshGrowth;
      // 解锁新酒杯类型
      if (this.unlockedGlassTypes < this.config.glassTypeCount) {
        this.unlockedGlassTypes++;
        this.logger.info('UNLOCK', `解锁新酒杯类型 #${this.unlockedGlassTypes - 1} | 当前类型数: ${this.unlockedGlassTypes}`);
      }
      this.targetGlasses = this.selectTargetGlasses();
      this.logger.info('TARGET', `目标酒杯刷新: [${this.targetGlasses.join(', ')}] | 下次阈值: ${this.targetRefreshThreshold}`);
      // 刷新后生成新障碍石
      this.spawnObstaclesAfterRefresh();
    }

    // 轮次奖励
    const totalRoundBonus = this.scoreCalculator.calculateRoundBonus(this.roundEliminations, this.config);
    const roundBonuses = totalRoundBonus - this.roundBonusAwarded;
    this.roundBonusAwarded = totalRoundBonus;
    this.score += roundBonuses;
    scoreGained += roundBonuses;

    if (roundBonuses > 0) {
      this.logger.info('BONUS', `轮次奖励: +${roundBonuses}分 | 本轮消除=${this.roundEliminations}`);
    }

    this.logger.info('SCORE', `本次得分: +${scoreGained} | 总分: ${this.score}`);

    const stagingEmpty = this.stagingArea.every((p) => p === null);

    if (!this.board.hasEmptyCell()) {
      this.gameOver = true;
      this.logger.info('GAME', `游戏结束 | 最终得分: ${this.score} | 轮次: ${this.round}`);
    } else if (stagingEmpty) {
      this.startNewRound();
    }

    return {
      success: true,
      mergeSteps: resolution.mergeSteps,
      eliminations: resolution.eliminations,
      scoreGained, comboCount: this.combo, roundBonuses,
    };
  }

  getState(): GameState {
    const obstacles: { pos: CellPosition; obstacle: Obstacle }[] = [];
    for (let r = 0; r < this.board.rows; r++) {
      for (let c = 0; c < this.board.cols; c++) {
        const obs = this.board.getObstacle(r, c);
        if (obs) obstacles.push({ pos: { row: r, col: c }, obstacle: { ...obs } });
      }
    }
    return {
      board: {
        rows: this.board.rows,
        cols: this.board.cols,
        cells: Array.from({ length: this.board.rows }, (_, r) =>
          Array.from({ length: this.board.cols }, (_, c) => this.board.getCell(r, c)),
        ),
      },
      stagingArea: [...this.stagingArea],
      score: this.score,
      combo: this.combo,
      round: this.round,
      roundEliminations: this.roundEliminations,
      targetGlasses: [...this.targetGlasses],
      totalFullEliminations: this.totalFullEliminations,
      targetRefreshThreshold: this.targetRefreshThreshold,
      unlockedGlassTypes: this.unlockedGlassTypes,
      obstacles,
      selectedPlateIndex: this.selectedPlateIndex,
      gameOver: this.gameOver,
    };
  }

  isGameOver(): boolean {
    return this.gameOver;
  }

  loadEditedState(cells: (Plate | null)[][], staging: (Plate | null)[]): void {
    this.board = new BoardState(this.config.boardRows, this.config.boardCols);
    this.placementCounter = 0;
    for (let r = 0; r < this.config.boardRows; r++) {
      for (let c = 0; c < this.config.boardCols; c++) {
        const plate = cells[r]?.[c] ?? null;
        if (plate) {
          plate.placedTimestamp = ++this.placementCounter;
          this.board.setCell(r, c, plate);
        }
      }
    }
    this.stagingArea = staging.map(p => p ? { ...p, placedTimestamp: null } : null);
    this.score = 0;
    this.combo = 0;
    this.round = 1;
    this.roundEliminations = 0;
    this.roundBonusAwarded = 0;
    this.totalFullEliminations = 0;
    this.selectedPlateIndex = null;
    this.gameOver = false;
    this.logger.info('EDIT', `编辑模式加载完成 | 棋盘盘子: ${cells.flat().filter(Boolean).length} | 临时区盘子: ${staging.filter(Boolean).length}`);
  }

  // --- Private helpers ---

  private selectTargetGlasses(): GlassType[] {
    const allTypes: GlassType[] = Array.from({ length: this.unlockedGlassTypes }, (_, i) => i);
    const m = Math.min(this.config.targetGlassCount, allTypes.length);
    for (let i = allTypes.length - 1; i > allTypes.length - 1 - m; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [allTypes[i]!, allTypes[j]!] = [allTypes[j]!, allTypes[i]!];
    }
    return allTypes.slice(allTypes.length - m);
  }

  private generateNewRound(): void {
    // 盘子生成器使用当前解锁的类型数
    this.plateGenerator.setGlassTypeCount(this.unlockedGlassTypes);
    const plates = this.plateGenerator.generatePlates(this.config.platesPerRound);
    this.stagingArea = plates;
    const desc = plates.map((p, i) => `#${i}(id=${p.id}, 酒杯=[${p.glasses.join(',')}])`).join(' | ');
    this.logger.info('ROUND', `第 ${this.round} 轮 | 发放盘子: ${desc}`);
  }

  private startNewRound(): void {
    this.round++;
    this.roundEliminations = 0;
    this.roundBonusAwarded = 0;
    this.generateNewRound();
  }

  /** 放置初始障碍石 */
  private placeInitialObstacles(): void {
    const emptyCells = this.getEmptyCells();
    const count = Math.min(this.config.initialObstacles, emptyCells.length);
    const chosen = this.pickRandom(emptyCells, count);
    for (const pos of chosen) {
      const seals = this.randomInt(1, 3);
      this.board.setObstacle(pos.row, pos.col, { initialSeals: seals, remainingSeals: seals });
      this.logger.info('OBSTACLE', `放置障碍石 (${pos.row},${pos.col}) | 封印: ${seals}层`);
    }
  }

  /** 处理满6消除后的障碍石封印破除 */
  private processObstacleBreaking(elimPositions: CellPosition[]): number {
    let totalScore = 0;
    for (const elimPos of elimPositions) {
      const neighbors = this.board.getNeighbors(elimPos.row, elimPos.col);
      for (const nPos of neighbors) {
        const obs = this.board.getObstacle(nPos.row, nPos.col);
        if (!obs || obs.remainingSeals <= 0) continue;
        obs.remainingSeals--;
        this.logger.info('OBSTACLE', `破除封印 (${nPos.row},${nPos.col}) | 剩余: ${obs.remainingSeals}层`);
        if (obs.remainingSeals <= 0) {
          const bonus = obs.initialSeals * 3;
          totalScore += bonus;
          this.board.setObstacle(nPos.row, nPos.col, null);
          // 破除障碍石获得刷新进度
          const progressGain = Math.floor(this.targetRefreshThreshold * 0.5);
          this.totalFullEliminations += progressGain;
          this.logger.info('OBSTACLE', `障碍石破除 (${nPos.row},${nPos.col}) | +${bonus}分 | 进度+${progressGain}`);
        }
      }
    }
    return totalScore;
  }

  /** 目标刷新后生成新障碍石 */
  private spawnObstaclesAfterRefresh(): void {
    let currentCount = 0;
    for (let r = 0; r < this.board.rows; r++) {
      for (let c = 0; c < this.board.cols; c++) {
        if (this.board.isObstacle(r, c)) currentCount++;
      }
    }
    const canSpawn = Math.min(
      this.config.obstaclesPerRefresh,
      this.config.maxObstacles - currentCount,
    );
    if (canSpawn <= 0) return;

    const emptyCells = this.getEmptyCells();
    const count = Math.min(canSpawn, emptyCells.length);
    const chosen = this.pickRandom(emptyCells, count);
    for (const pos of chosen) {
      const seals = this.randomInt(1, 3);
      this.board.setObstacle(pos.row, pos.col, { initialSeals: seals, remainingSeals: seals });
      this.logger.info('OBSTACLE', `刷新障碍石 (${pos.row},${pos.col}) | 封印: ${seals}层`);
    }
  }

  /** 获取所有可放置的空格 */
  private getEmptyCells(): CellPosition[] {
    const cells: CellPosition[] = [];
    for (let r = 0; r < this.board.rows; r++) {
      for (let c = 0; c < this.board.cols; c++) {
        if (this.board.isPlaceable(r, c)) cells.push({ row: r, col: c });
      }
    }
    return cells;
  }

  /** 从数组中随机选取 count 个元素 */
  private pickRandom<T>(arr: T[], count: number): T[] {
    const copy = [...arr];
    const result: T[] = [];
    for (let i = 0; i < count && copy.length > 0; i++) {
      const idx = Math.floor(this.random() * copy.length);
      result.push(copy.splice(idx, 1)[0]!);
    }
    return result;
  }

  private randomInt(min: number, max: number): number {
    return min + Math.floor(this.random() * (max - min + 1));
  }
}

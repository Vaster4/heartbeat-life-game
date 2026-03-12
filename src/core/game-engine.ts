import type {
  GameConfig,
  GameState,
  GlassType,
  IGameEngine,
  Plate,
  PlacementResult,
} from '../types';
import { createConfig } from './config';
import { BoardState } from './board';
import { PlateGenerator, type RandomFn } from './plate-generator';
import { MergeAlgorithm } from './merge';
import { ScoreCalculator } from './score';

/**
 * 游戏引擎：协调棋盘、盘子生成器等子系统。
 * 当前实现放置逻辑，合并/消除/得分将在后续任务中集成。
 */
export class GameEngine implements IGameEngine {
  private readonly config: GameConfig;
  private board: BoardState;
  private readonly plateGenerator: PlateGenerator;
  private readonly mergeAlgorithm: MergeAlgorithm;
  private readonly scoreCalculator: ScoreCalculator;
  private readonly random: RandomFn;

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

  /** Incrementing counter for deterministic placement ordering */
  private placementCounter = 0;

  constructor(config?: Partial<GameConfig>, random: RandomFn = Math.random) {
    this.config = createConfig(config);
    this.random = random;
    this.board = new BoardState(this.config.boardRows, this.config.boardCols);
    this.plateGenerator = new PlateGenerator(this.config, random);
    this.mergeAlgorithm = new MergeAlgorithm();
    this.scoreCalculator = new ScoreCalculator();
  }

  start(): void {
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

    this.targetGlasses = this.selectTargetGlasses();
    this.generateNewRound();
  }

  reset(): void {
    this.start();
  }

  selectPlate(index: number): void {
    if (index < 0 || index >= this.stagingArea.length) {
      return;
    }
    if (this.stagingArea[index] === null) {
      return;
    }
    this.selectedPlateIndex = index;
  }

  placePlate(row: number, col: number): PlacementResult {
    const fail: PlacementResult = {
      success: false,
      mergeSteps: [],
      eliminations: [],
      scoreGained: 0,
      comboCount: 0,
      roundBonuses: 0,
    };

    // No plate selected
    if (this.selectedPlateIndex === null) {
      return fail;
    }

    // Out of bounds
    if (row < 0 || row >= this.config.boardRows || col < 0 || col >= this.config.boardCols) {
      return fail;
    }

    // Cell not empty
    if (!this.board.isEmpty(row, col)) {
      return fail;
    }

    const plate = this.stagingArea[this.selectedPlateIndex];
    if (!plate) {
      return fail;
    }

    // Reset combo for this move
    this.combo = 0;

    // Record placement timestamp (incrementing counter for deterministic ordering)
    plate.placedTimestamp = ++this.placementCounter;

    // Place plate on board
    this.board.setCell(row, col, plate);

    // Remove from staging area
    this.stagingArea[this.selectedPlateIndex] = null;
    this.selectedPlateIndex = null;

    // Run merge/elimination resolution until stable
    const resolution = this.mergeAlgorithm.resolveUntilStable(this.board);

    // Calculate score from eliminations
    let scoreGained = 0;
    for (const elim of resolution.eliminations) {
      if (elim.reason === 'full_same_type') {
        this.combo++;
        const points = this.scoreCalculator.calculateEliminationScore(
          elim,
          this.combo,
          this.targetGlasses,
        );
        scoreGained += points;
        this.roundEliminations++;
        this.totalFullEliminations++;
      }
      // empty plate elimination: 0 points (calculateEliminationScore returns 0)
    }
    this.score += scoreGained;

    // Target glass refresh: re-select when threshold reached
    if (this.totalFullEliminations >= this.config.targetGlassRefreshThreshold) {
      this.targetGlasses = this.selectTargetGlasses();
      this.totalFullEliminations = 0;
    }

    // Calculate round bonus: only add the INCREMENTAL bonus (new total - previously awarded)
    const totalRoundBonus = this.scoreCalculator.calculateRoundBonus(
      this.roundEliminations,
      this.config,
    );
    const roundBonuses = totalRoundBonus - this.roundBonusAwarded;
    this.roundBonusAwarded = totalRoundBonus;
    this.score += roundBonuses;
    scoreGained += roundBonuses;

    // Check if staging area is empty → new round or game over
    const stagingEmpty = this.stagingArea.every((p) => p === null);
    if (stagingEmpty) {
      // Game-over check AFTER merge/elimination (eliminations can free cells)
      if (!this.board.hasEmptyCell()) {
        this.gameOver = true;
      } else {
        this.startNewRound();
      }
    }

    return {
      success: true,
      mergeSteps: resolution.mergeSteps,
      eliminations: resolution.eliminations,
      scoreGained,
      comboCount: this.combo,
      roundBonuses,
    };
  }

  getState(): GameState {
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
      selectedPlateIndex: this.selectedPlateIndex,
      gameOver: this.gameOver,
    };
  }

  isGameOver(): boolean {
    return this.gameOver;
  }

  // --- Private helpers ---

  /** Select m random target glass types from available types (no duplicates) */
  private selectTargetGlasses(): GlassType[] {
    const allTypes: GlassType[] = Array.from(
      { length: this.config.glassTypeCount },
      (_, i) => i,
    );

    // Fisher-Yates shuffle (partial, only need m elements)
    const m = Math.min(this.config.targetGlassCount, allTypes.length);
    for (let i = allTypes.length - 1; i > allTypes.length - 1 - m; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [allTypes[i]!, allTypes[j]!] = [allTypes[j]!, allTypes[i]!];
    }

    return allTypes.slice(allTypes.length - m);
  }

  /** Generate new plates into staging area */
  private generateNewRound(): void {
    const plates = this.plateGenerator.generatePlates(this.config.platesPerRound);
    this.stagingArea = plates;
  }

  /** Start a new round: increment round counter, reset round eliminations, generate plates */
  private startNewRound(): void {
    this.round++;
    this.roundEliminations = 0;
    this.roundBonusAwarded = 0;
    this.generateNewRound();
  }
}

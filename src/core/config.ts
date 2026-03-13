import type { GameConfig, RoundBonus } from '../types';

/** 默认游戏配置 */
export const DEFAULT_CONFIG: Readonly<GameConfig> = {
  boardRows: 6,
  boardCols: 4,
  glassTypeCount: 8,
  initialGlassTypes: 3,
  minGlassesPerPlate: 1,
  maxGlassesPerPlate: 3,
  slotsPerPlate: 6,
  platesPerRound: 3,
  targetGlassCount: 2,
  targetGlassRefreshThreshold: 4,
  targetRefreshGrowth: 2,
  initialObstacles: 4,
  maxObstacles: 6,
  obstaclesPerRefresh: 2,
  roundBonuses: [
    { threshold: 3, bonus: 1 },
    { threshold: 6, bonus: 5 },
    { threshold: 9, bonus: 10 },
  ],
};

/**
 * 校验配置，不合法参数回退默认值并 console.warn。
 * 返回一个保证合法的 GameConfig。
 */
export function validateConfig(config: GameConfig): GameConfig {
  const result = { ...config, roundBonuses: [...config.roundBonuses] };

  // boardRows >= 1
  if (!Number.isFinite(result.boardRows) || result.boardRows < 1) {
    console.warn(`Invalid boardRows (${result.boardRows}), falling back to default (${DEFAULT_CONFIG.boardRows})`);
    result.boardRows = DEFAULT_CONFIG.boardRows;
  }

  // boardCols >= 1
  if (!Number.isFinite(result.boardCols) || result.boardCols < 1) {
    console.warn(`Invalid boardCols (${result.boardCols}), falling back to default (${DEFAULT_CONFIG.boardCols})`);
    result.boardCols = DEFAULT_CONFIG.boardCols;
  }

  // glassTypeCount >= 1
  if (!Number.isFinite(result.glassTypeCount) || result.glassTypeCount < 1) {
    console.warn(`Invalid glassTypeCount (${result.glassTypeCount}), falling back to default (${DEFAULT_CONFIG.glassTypeCount})`);
    result.glassTypeCount = DEFAULT_CONFIG.glassTypeCount;
  }

  // slotsPerPlate should be positive
  if (!Number.isFinite(result.slotsPerPlate) || result.slotsPerPlate < 1) {
    console.warn(`Invalid slotsPerPlate (${result.slotsPerPlate}), falling back to default (${DEFAULT_CONFIG.slotsPerPlate})`);
    result.slotsPerPlate = DEFAULT_CONFIG.slotsPerPlate;
  }

  // platesPerRound should be positive
  if (!Number.isFinite(result.platesPerRound) || result.platesPerRound < 1) {
    console.warn(`Invalid platesPerRound (${result.platesPerRound}), falling back to default (${DEFAULT_CONFIG.platesPerRound})`);
    result.platesPerRound = DEFAULT_CONFIG.platesPerRound;
  }

  // minGlassesPerPlate <= maxGlassesPerPlate (fallback both if violated)
  if (
    !Number.isFinite(result.minGlassesPerPlate) ||
    !Number.isFinite(result.maxGlassesPerPlate) ||
    result.minGlassesPerPlate > result.maxGlassesPerPlate
  ) {
    console.warn(
      `Invalid glasses range (min=${result.minGlassesPerPlate}, max=${result.maxGlassesPerPlate}), falling back to defaults (min=${DEFAULT_CONFIG.minGlassesPerPlate}, max=${DEFAULT_CONFIG.maxGlassesPerPlate})`,
    );
    result.minGlassesPerPlate = DEFAULT_CONFIG.minGlassesPerPlate;
    result.maxGlassesPerPlate = DEFAULT_CONFIG.maxGlassesPerPlate;
  }

  // targetGlassCount <= glassTypeCount
  if (!Number.isFinite(result.targetGlassCount) || result.targetGlassCount > result.glassTypeCount) {
    console.warn(
      `Invalid targetGlassCount (${result.targetGlassCount}), falling back to default (${DEFAULT_CONFIG.targetGlassCount})`,
    );
    result.targetGlassCount = DEFAULT_CONFIG.targetGlassCount;
  }

  // targetGlassRefreshThreshold >= 1
  if (!Number.isFinite(result.targetGlassRefreshThreshold) || result.targetGlassRefreshThreshold < 1) {
    console.warn(
      `Invalid targetGlassRefreshThreshold (${result.targetGlassRefreshThreshold}), falling back to default (${DEFAULT_CONFIG.targetGlassRefreshThreshold})`,
    );
    result.targetGlassRefreshThreshold = DEFAULT_CONFIG.targetGlassRefreshThreshold;
  }

  // initialGlassTypes >= 1 and <= glassTypeCount
  if (!Number.isFinite(result.initialGlassTypes) || result.initialGlassTypes < 1 || result.initialGlassTypes > result.glassTypeCount) {
    result.initialGlassTypes = DEFAULT_CONFIG.initialGlassTypes;
  }

  // targetRefreshGrowth >= 0
  if (!Number.isFinite(result.targetRefreshGrowth) || result.targetRefreshGrowth < 0) {
    result.targetRefreshGrowth = DEFAULT_CONFIG.targetRefreshGrowth;
  }

  // initialObstacles >= 0
  if (!Number.isFinite(result.initialObstacles) || result.initialObstacles < 0) {
    result.initialObstacles = DEFAULT_CONFIG.initialObstacles;
  }

  // maxObstacles >= initialObstacles
  if (!Number.isFinite(result.maxObstacles) || result.maxObstacles < result.initialObstacles) {
    result.maxObstacles = DEFAULT_CONFIG.maxObstacles;
  }

  // obstaclesPerRefresh >= 0
  if (!Number.isFinite(result.obstaclesPerRefresh) || result.obstaclesPerRefresh < 0) {
    result.obstaclesPerRefresh = DEFAULT_CONFIG.obstaclesPerRefresh;
  }

  // roundBonuses thresholds should be in ascending order
  if (!isAscendingThresholds(result.roundBonuses)) {
    console.warn('Invalid roundBonuses (thresholds not in ascending order), falling back to defaults');
    result.roundBonuses = [...DEFAULT_CONFIG.roundBonuses];
  }

  return result;
}

/**
 * 创建游戏配置：将用户提供的部分配置与默认值合并，然后校验。
 */
export function createConfig(partial?: Partial<GameConfig>): GameConfig {
  const merged: GameConfig = {
    ...DEFAULT_CONFIG,
    ...partial,
    roundBonuses: partial?.roundBonuses
      ? [...partial.roundBonuses]
      : [...DEFAULT_CONFIG.roundBonuses],
  };
  return validateConfig(merged);
}

/** 检查 roundBonuses 的 threshold 是否严格递增 */
function isAscendingThresholds(bonuses: RoundBonus[]): boolean {
  for (let i = 1; i < bonuses.length; i++) {
    const current = bonuses[i]!;
    const previous = bonuses[i - 1]!;
    if (current.threshold <= previous.threshold) {
      return false;
    }
  }
  return true;
}

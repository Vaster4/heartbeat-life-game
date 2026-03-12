import type {
  EliminationEvent,
  GameConfig,
  GlassType,
  IScoreCalculator,
} from '../types';

/**
 * 得分计算器：负责 combo 得分、目标酒杯翻倍、单轮额外奖励计算。
 */
export class ScoreCalculator implements IScoreCalculator {
  /**
   * 计算单次消除得分。
   *
   * - 空盘消除 (reason: 'empty'): 0 分
   * - 满盘同类型消除 (reason: 'full_same_type'):
   *   - 基础分 = comboIndex（第1个=1, 第2个=2, ...）
   *   - 若酒杯类型在 targetGlasses 中: 得分 × 2
   */
  calculateEliminationScore(
    event: EliminationEvent,
    comboIndex: number,
    targetGlasses: GlassType[],
  ): number {
    if (event.reason === 'empty') {
      return 0;
    }

    let score = comboIndex;

    if (
      event.plate.glasses.length > 0 &&
      targetGlasses.includes(event.plate.glasses[0]!)
    ) {
      score *= 2;
    }

    return score;
  }

  /**
   * 计算单轮额外奖励。
   *
   * 返回所有已达到阈值的奖励之和。
   * 例: roundEliminations=7, bonuses=[{3,1},{6,5},{9,10}] → 1+5=6
   */
  calculateRoundBonus(
    roundEliminations: number,
    config: GameConfig,
  ): number {
    let total = 0;
    for (const rb of config.roundBonuses) {
      if (roundEliminations >= rb.threshold) {
        total += rb.bonus;
      }
    }
    return total;
  }
}

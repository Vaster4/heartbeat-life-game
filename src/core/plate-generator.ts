import type { GameConfig, GlassType, IPlateGenerator, Plate } from '../types';

/** 随机数生成器类型：返回 [0, 1) 的浮点数 */
export type RandomFn = () => number;

/**
 * 盘子生成器。
 * 根据 GameConfig 生成随机盘子，支持注入随机数生成器以实现确定性测试。
 */
export class PlateGenerator implements IPlateGenerator {
  private readonly config: GameConfig;
  private readonly random: RandomFn;
  private nextId = 1;

  constructor(config: GameConfig, random: RandomFn = Math.random) {
    this.config = config;
    this.random = random;
  }

  generatePlates(count: number): Plate[] {
    const plates: Plate[] = [];
    for (let i = 0; i < count; i++) {
      plates.push(this.generateOnePlate());
    }
    return plates;
  }

  private generateOnePlate(): Plate {
    const { minGlassesPerPlate, maxGlassesPerPlate, glassTypeCount } = this.config;

    // 随机酒杯数量：[min, max] 闭区间
    const glassCount = this.randomInt(minGlassesPerPlate, maxGlassesPerPlate);

    // 随机酒杯类型：[0, glassTypeCount - 1]
    const glasses: GlassType[] = [];
    for (let i = 0; i < glassCount; i++) {
      glasses.push(this.randomInt(0, glassTypeCount - 1));
    }

    const id = `plate-${this.nextId++}`;

    return {
      id,
      glasses,
      placedTimestamp: null,
    };
  }

  /** 返回 [min, max] 闭区间内的随机整数 */
  private randomInt(min: number, max: number): number {
    return min + Math.floor(this.random() * (max - min + 1));
  }
}

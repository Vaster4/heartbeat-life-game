import { describe, it, expect } from 'vitest';
import { PlateGenerator } from '../../src/core/plate-generator';
import { createConfig } from '../../src/core/config';

describe('PlateGenerator', () => {
  const defaultConfig = createConfig();

  it('should generate the requested number of plates', () => {
    const gen = new PlateGenerator(defaultConfig, () => 0.5);
    const plates = gen.generatePlates(3);
    expect(plates).toHaveLength(3);
  });

  it('should generate 0 plates when count is 0', () => {
    const gen = new PlateGenerator(defaultConfig, () => 0.5);
    expect(gen.generatePlates(0)).toHaveLength(0);
  });

  it('should assign unique ids to each plate', () => {
    const gen = new PlateGenerator(defaultConfig, () => 0.5);
    const plates = gen.generatePlates(5);
    const ids = plates.map((p) => p.id);
    expect(new Set(ids).size).toBe(5);
  });

  it('should set placedTimestamp to null for all generated plates', () => {
    const gen = new PlateGenerator(defaultConfig, () => 0.5);
    const plates = gen.generatePlates(3);
    for (const plate of plates) {
      expect(plate.placedTimestamp).toBeNull();
    }
  });

  it('should generate glasses count within configured range', () => {
    const config = createConfig({ minGlassesPerPlate: 2, maxGlassesPerPlate: 4 });
    // Use a sequence of random values to cover different glass counts
    let callIndex = 0;
    const values = [0.0, 0.5, 0.99, 0.3, 0.7, 0.1, 0.9, 0.2, 0.8, 0.4, 0.6, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const gen = new PlateGenerator(config, () => values[callIndex++ % values.length]!);
    const plates = gen.generatePlates(5);
    for (const plate of plates) {
      expect(plate.glasses.length).toBeGreaterThanOrEqual(2);
      expect(plate.glasses.length).toBeLessThanOrEqual(4);
    }
  });

  it('should generate glass types within [0, glassTypeCount)', () => {
    const config = createConfig({ glassTypeCount: 3 });
    let callIndex = 0;
    const values = [0.5, 0.0, 0.33, 0.66, 0.99];
    const gen = new PlateGenerator(config, () => values[callIndex++ % values.length]!);
    const plates = gen.generatePlates(3);
    for (const plate of plates) {
      for (const glass of plate.glasses) {
        expect(glass).toBeGreaterThanOrEqual(0);
        expect(glass).toBeLessThan(3);
      }
    }
  });

  it('should produce deterministic output with a fixed random function', () => {
    const config = createConfig({ minGlassesPerPlate: 2, maxGlassesPerPlate: 3, glassTypeCount: 4 });
    const makeRng = () => {
      let i = 0;
      const seq = [0.1, 0.5, 0.9, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6, 0.0];
      return () => seq[i++ % seq.length]!;
    };

    const gen1 = new PlateGenerator(config, makeRng());
    const gen2 = new PlateGenerator(config, makeRng());

    const plates1 = gen1.generatePlates(3);
    const plates2 = gen2.generatePlates(3);

    // Same glasses content (ids differ because they're from different instances)
    for (let i = 0; i < 3; i++) {
      expect(plates1[i]!.glasses).toEqual(plates2[i]!.glasses);
    }
  });

  it('should handle minGlassesPerPlate === maxGlassesPerPlate', () => {
    const config = createConfig({ minGlassesPerPlate: 3, maxGlassesPerPlate: 3 });
    const gen = new PlateGenerator(config, () => 0.5);
    const plates = gen.generatePlates(2);
    for (const plate of plates) {
      expect(plate.glasses).toHaveLength(3);
    }
  });

  it('should handle glassTypeCount === 1 (all glasses same type)', () => {
    const config = createConfig({ glassTypeCount: 1 });
    const gen = new PlateGenerator(config, () => 0.5);
    const plates = gen.generatePlates(2);
    for (const plate of plates) {
      for (const glass of plate.glasses) {
        expect(glass).toBe(0);
      }
    }
  });
});

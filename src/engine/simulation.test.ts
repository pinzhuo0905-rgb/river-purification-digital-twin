import { simulatePurification, SimulationParams } from './simulation';
import { test, expect } from 'vitest';

test('calculates decay and optimal location', () => {
  const params: SimulationParams = {
    gridWidth: 100,
    gridHeight: 100,
    velocity: 2.0,
    directionAngle: 0, // 向右
    lightIntensity: 1.0,
    catalystEfficiency: 0.8
  };
  const result = simulatePurification(params);
  
  expect(result.optimalX).toBeGreaterThanOrEqual(0);
  expect(result.optimalY).toBeGreaterThanOrEqual(0);
  expect(result.gridData[result.optimalY][result.optimalX]).toBeLessThan(1.0);
});

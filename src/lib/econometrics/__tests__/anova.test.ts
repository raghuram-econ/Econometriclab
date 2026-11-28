import { calculateOneWayAnova } from '../anova';

describe('calculateOneWayAnova', () => {
  it('matches hand-calculated sums of squares for two groups', () => {
    const result = calculateOneWayAnova([
      { y: 1, group: 'A' }, { y: 2, group: 'A' }, { y: 3, group: 'A' },
      { y: 4, group: 'B' }, { y: 5, group: 'B' }, { y: 6, group: 'B' }
    ], 'y', 'group');

    expect(result.n).toBe(6);
    expect(result.dfBetween).toBe(1);
    expect(result.dfWithin).toBe(4);
    expect(result.ssBetween).toBeCloseTo(13.5, 10);
    expect(result.ssWithin).toBeCloseTo(4, 10);
    expect(result.fStatistic).toBeCloseTo(13.5, 10);
    expect(result.pValue).toBeCloseTo(0.0213116, 6);
    expect(result.etaSquared).toBeCloseTo(0.7714286, 6);
  });

  it('omits rows with missing outcomes or groups and rejects fewer than two groups', () => {
    const result = calculateOneWayAnova([
      { y: 1, group: 'A' }, { y: 2, group: 'A' }, { y: 4, group: 'B' },
      { y: 5, group: 'B' }, { y: null, group: 'B' }, { y: 3, group: '' }
    ], 'y', 'group');
    expect(result.n).toBe(4);
    expect(result.excludedRows).toBe(2);
    expect(() => calculateOneWayAnova([{ y: 1, group: 'A' }, { y: 2, group: 'A' }], 'y', 'group'))
      .toThrow('at least two non-empty groups');
  });
});

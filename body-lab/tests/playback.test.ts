import { describe, expect, it } from 'vitest';
import { conductionSpeed, playbackSeconds, travelMs } from '../src/models/physiology';

describe('nerve playback', () => {
  it('keeps faster fibres faster on screen, within a watchable range', () => {
    const fast = playbackSeconds(travelMs(1, conductionSpeed(20, true)));
    const slow = playbackSeconds(travelMs(1, conductionSpeed(0.2, false)));
    expect(fast).toBeLessThan(slow);
    expect(fast).toBeGreaterThanOrEqual(0.5);
    expect(slow).toBeLessThan(4);
  });
});

/**
 * Expected-completion and expected-first-down estimates.
 *
 * IMPORTANT, and stated plainly because the number looks authoritative on a
 * HUD: this is NOT the NFL Next Gen Stats model. That model is fit on years of
 * league-wide chip tracking data that is not publicly available. What follows
 * is a transparent logistic model over the four features this app can actually
 * measure, with coefficients seeded from published NFL passing splits (air
 * yards, time to throw, pressure, defender proximity).
 *
 * Treat the seeded output as a reasoned prior, useful for comparing one rep
 * against another, not as a claim about true completion probability. The honest
 * path to trustworthy numbers is `LogisticModel.fit` below: record reps, mark
 * the outcomes, and refit on your own quarterbacks so the coefficients describe
 * your players rather than a league average.
 */

export type PassFeatures = {
  /** Release point to target, in yards. */
  throwDistance: number;
  /** Seconds from snap to release. */
  timeToThrow: number;
  /** Nearest defender to the QB at release, in yards. */
  separationAtRelease: number;
  /** 1 when a defender broke the pressure radius before the release. */
  pressured: 0 | 1;
};

export type Coefficients = {
  intercept: number;
  throwDistance: number;
  timeToThrow: number;
  separationAtRelease: number;
  pressured: number;
};

/**
 * Seeded priors, in log-odds. Signs encode well-established passing effects:
 * completion rate falls with air yards and with pressure, and rises with clean
 * separation; time to throw hurts mildly once it runs long.
 */
export const SEEDED_COMPLETION_COEFFICIENTS: Coefficients = {
  intercept: 2.35,
  throwDistance: -0.055,
  timeToThrow: -0.18,
  separationAtRelease: 0.09,
  pressured: -0.85,
};

/** Feature scaling keeps gradient steps sane when refitting on real reps. */
const FEATURE_SCALE: Record<keyof PassFeatures, number> = {
  throwDistance: 20,
  timeToThrow: 3,
  separationAtRelease: 5,
  pressured: 1,
};

export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export class LogisticModel {
  constructor(private coefficients: Coefficients = { ...SEEDED_COMPLETION_COEFFICIENTS }) {}

  get params(): Coefficients {
    return { ...this.coefficients };
  }

  predict(features: PassFeatures): number {
    const c = this.coefficients;
    const z =
      c.intercept +
      c.throwDistance * features.throwDistance +
      c.timeToThrow * features.timeToThrow +
      c.separationAtRelease * features.separationAtRelease +
      c.pressured * features.pressured;
    return sigmoid(z);
  }

  /**
   * Refit on recorded reps by batch gradient descent.
   *
   * Small by design: a coach's own season is hundreds of reps, not millions, so
   * a closed-form-free iterative fit over a handful of features is the right
   * size of tool. Features are scaled during the fit and the coefficients are
   * unscaled on the way out, so `predict` keeps taking raw yards and seconds.
   */
  fit(
    samples: { features: PassFeatures; completed: boolean }[],
    options: { iterations?: number; learningRate?: number; l2?: number } = {},
  ): Coefficients {
    const { iterations = 2000, learningRate = 0.1, l2 = 0.01 } = options;
    if (samples.length === 0) return this.params;

    const keys: (keyof PassFeatures)[] = [
      'throwDistance',
      'timeToThrow',
      'separationAtRelease',
      'pressured',
    ];

    // Start from the seeded priors expressed in scaled space, so a small sample
    // refines league-shaped beliefs instead of starting from nothing.
    let intercept = this.coefficients.intercept;
    const weights: Record<string, number> = {};
    for (const key of keys) weights[key] = this.coefficients[key] * FEATURE_SCALE[key];

    const n = samples.length;

    for (let iter = 0; iter < iterations; iter++) {
      let interceptGrad = 0;
      const grads: Record<string, number> = {};
      for (const key of keys) grads[key] = 0;

      for (const sample of samples) {
        let z = intercept;
        for (const key of keys) z += weights[key] * (sample.features[key] / FEATURE_SCALE[key]);

        const error = sigmoid(z) - (sample.completed ? 1 : 0);
        interceptGrad += error;
        for (const key of keys) {
          grads[key] += error * (sample.features[key] / FEATURE_SCALE[key]);
        }
      }

      intercept -= learningRate * (interceptGrad / n);
      for (const key of keys) {
        weights[key] -= learningRate * (grads[key] / n + l2 * weights[key]);
      }
    }

    this.coefficients = {
      intercept,
      throwDistance: weights.throwDistance / FEATURE_SCALE.throwDistance,
      timeToThrow: weights.timeToThrow / FEATURE_SCALE.timeToThrow,
      separationAtRelease: weights.separationAtRelease / FEATURE_SCALE.separationAtRelease,
      pressured: weights.pressured / FEATURE_SCALE.pressured,
    };

    return this.params;
  }
}

export const completionModel = new LogisticModel();

/**
 * Expected first down, given the distance still needed for the sticks.
 *
 * A pass only converts if it is caught AND it travels far enough, so this is
 * the completion probability gated by whether the throw reaches the marker.
 * Short of the sticks it is not zero — receivers gain yards after the catch —
 * so a modest YAC allowance carries throws that land just short.
 */
export function expectedFirstDown(
  completionProbability: number,
  throwDistance: number,
  yardsToGo: number,
): number {
  const shortfall = yardsToGo - throwDistance;
  if (shortfall <= 0) return completionProbability;

  // Logistic decay: roughly a coin flip on a 4-yard shortfall, fading out by 12.
  const yacChance = sigmoid(2.2 - 0.55 * shortfall);
  return completionProbability * yacChance;
}

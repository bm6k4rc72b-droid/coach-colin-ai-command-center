/**
 * Loss scenarios and the effect each control has on them.
 *
 * Three scenarios, chosen because the identity graph says they are the paths
 * that exist — not because they are the ones that make a good slide. Each
 * carries its basis, because an estimate without one cannot be argued with, and
 * an estimate nobody can argue with does not get believed.
 *
 * The multipliers in {@link CONTROL_EFFECTS} are the softest numbers in the
 * console and they are written down rather than buried, so a reviewer can
 * substitute their own and watch the ranking move. In practice the ranking is
 * stable under quite large changes to the inputs, which is the useful property:
 * being wrong by a factor of two rarely changes what to fund first.
 *
 * @module blast-radius/scenarios
 */

/**
 * Baseline loss scenarios for the demonstration estate.
 *
 * @type {import('./fair.js').Scenario[]}
 */
export const SCENARIOS = [
  {
    id: 'sc-agent-chain',
    name: 'Support agent compromised into cardholder data',
    narrative: 'An instruction planted in a ticket or a knowledge-base article steers the support agent. Its shared tool role reads the payments signing key, and the cardholder vault is read at scale.',
    frequency: { min: 0.03, mode: 0.17, max: 0.7 },
    magnitude: { low: 9_600_000, high: 43_000_000 },
    basis: [
      '2.4M card records at $4–$18 per record: notification, card reissue, card-scheme fines, forensics and churn.',
      'Frequency derived from the composed kill chain: injection attempts reaching the agent, times the feasibility the chain analysis produces, times the share that run to completion before anyone reacts.',
      'The completion share is the softest input in the model. Halving it halves the expectation and does not change which control ranks first.',
    ],
    controls: ['ctl-agent-secret-scope', 'ctl-tool-approval'],
  },
  {
    id: 'sc-pipeline-admin',
    name: 'Pipeline federation abused to production administrator',
    narrative: 'A pull request from any repository in the organization mints deployment credentials; PassRole over every role turns them into administrative ones, and the whole production account follows.',
    frequency: { min: 0.02, mode: 0.12, max: 0.6 },
    magnitude: { low: 4_000_000, high: 60_000_000 },
    basis: [
      'Magnitude spans a contained credential-theft event through to full production compromise with destruction of backups; the spread reflects genuine uncertainty rather than hedging.',
      'Frequency assumes the wildcard subject is discoverable by anyone reading the workflow file, and that exploitation requires no unusual skill.',
      'One near miss already occurred and was reported rather than exploited (INC-2025-231), which is evidence about discoverability, not about luck.',
    ],
    controls: ['ctl-oidc-pin', 'ctl-passrole-constraint', 'ctl-scp-trust'],
  },
  {
    id: 'sc-analyst-pii',
    name: 'Analyst credential theft into the customer PII lake',
    narrative: 'An analyst account without MFA is phished; the stored analytics credential and a permissive assume-role grant reach 6.1M customer records.',
    frequency: { min: 0.1, mode: 0.4, max: 1.5 },
    magnitude: { low: 1_800_000, high: 12_000_000 },
    basis: [
      '6.1M records of name, address and order history at roughly $0.30–$2.00 per record — regulatory exposure without the card-scheme penalties.',
      'Frequency is the highest of the three because phishing a human is the most reliably repeatable step in the estate.',
      'Assumes detection within days rather than minutes, matching the current absence of a data-volume rule on that bucket.',
    ],
    controls: ['ctl-boundary'],
  },
];

/**
 * How each control moves each scenario, and why.
 *
 * A multiplier of 0.25 on frequency means "this control removes about three
 * quarters of the occasions where this scenario would otherwise play out". The
 * justification field exists so that claim can be challenged directly rather
 * than through the total.
 *
 * @type {import('./fair.js').ControlEffect[]}
 */
export const CONTROL_EFFECTS = [
  {
    control: 'ctl-agent-secret-scope',
    scenario: 'sc-agent-chain',
    frequencyMultiplier: 0.15,
    justification: 'Removes the credential-access hop entirely. The agent can still be injected and can still misuse its own tools, which is what the residual 15% represents.',
  },
  {
    control: 'ctl-tool-approval',
    scenario: 'sc-agent-chain',
    frequencyMultiplier: 0.45,
    magnitudeMultiplier: 0.6,
    justification: 'A person sees each refund, and the same person is likely to notice a burst of them. Cuts both how often the chain completes and how far it gets before someone reacts. Weaker than the identity fix and roughly twenty times the price.',
  },
  {
    control: 'ctl-oidc-pin',
    scenario: 'sc-pipeline-admin',
    frequencyMultiplier: 0.1,
    justification: 'Closes the entry point: a fork can no longer mint credentials at all. What remains is compromise of the pinned repository itself.',
  },
  {
    control: 'ctl-passrole-constraint',
    scenario: 'sc-pipeline-admin',
    frequencyMultiplier: 0.35,
    magnitudeMultiplier: 0.5,
    justification: 'Entry still possible, but deployment rights no longer convert to administrative ones, so the reachable set shrinks to the application roles.',
  },
  {
    control: 'ctl-scp-trust',
    scenario: 'sc-pipeline-admin',
    frequencyMultiplier: 0.8,
    justification: 'Closes one alternative route among several. Cheap, and honestly marginal on this scenario — its value is that it holds against paths nobody has enumerated yet.',
  },
  {
    control: 'ctl-boundary',
    scenario: 'sc-analyst-pii',
    frequencyMultiplier: 0.55,
    justification: 'The analyst still reaches the data they are entitled to; the boundary stops the account from becoming more than an analyst. Does not address the phish itself, which is why the residual is high.',
  },
  {
    control: 'ctl-per-tool-identity',
    scenario: 'sc-agent-chain',
    frequencyMultiplier: 0.25,
    justification: 'The refund tool has no grant that reaches a payments secret, so the chain ends at an unhelpful refund. Overlaps with scoping the secret grant; when both are on, the model multiplies and slightly overstates the pair.',
  },
  {
    control: 'ctl-provenance',
    scenario: 'sc-agent-chain',
    frequencyMultiplier: 0.35,
    justification: 'Removes the indirect route through the knowledge base, which is the one that does not require the attacker to talk to the agent at all. Direct injection through a ticket remains.',
  },
  {
    control: 'ctl-screening',
    scenario: 'sc-agent-chain',
    frequencyMultiplier: 0.8,
    justification: 'Measured, not assumed: recall on the corpus is 0.86 against payloads it has seen, and the two known misses are exactly the shapes an adversary would move to. A 20% reduction is generous.',
  },
  {
    control: 'ctl-egress',
    scenario: 'sc-agent-chain',
    magnitudeMultiplier: 0.7,
    justification: 'Does not stop the chain; caps how much leaves through the answer channel once it runs.',
  },
  {
    control: 'ctl-boundary',
    scenario: 'sc-pipeline-admin',
    frequencyMultiplier: 0.7,
    justification: 'Backstop rather than fix: prevents self-granting after entry, but the PassRole route does not need a self-grant.',
  },
];

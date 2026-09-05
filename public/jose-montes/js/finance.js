/**
 * The numbers behind the number.
 *
 * A luxury site that quotes a price and stops has told the visitor almost
 * nothing. This module turns a price into the figure people actually decide
 * on — the monthly payment, all of it, including the parts agents leave off:
 * property tax at the county rate, insurance, and mortgage insurance while
 * the loan is above eighty percent.
 *
 * Every function is pure arithmetic and is tested without a browser. None of
 * it is advice, and the UI says so.
 *
 * @module jose-montes/finance
 */

/** San Luis Obispo County's effective rate, near enough for a first pass. */
export const COUNTY_TAX_RATE = 0.0108;

/**
 * The level payment on an amortising loan.
 *
 * @param {number} principal Amount borrowed.
 * @param {number} annualRate Nominal annual rate, e.g. 0.0625.
 * @param {number} years Term in years.
 * @returns {number} The monthly principal-and-interest payment.
 */
export function monthlyPayment(principal, annualRate, years) {
  if (principal <= 0 || years <= 0) return 0;
  const n = years * 12;
  const r = annualRate / 12;
  if (r === 0) return principal / n;
  const growth = (1 + r) ** n;
  return (principal * r * growth) / (growth - 1);
}

/**
 * The whole monthly cost of owning, not just the mortgage.
 *
 * @param {object} input The scenario.
 * @param {number} input.price Purchase price.
 * @param {number} input.downPct Down payment as a fraction, e.g. 0.2.
 * @param {number} input.rate Annual interest rate.
 * @param {number} [input.years] Term.
 * @param {number} [input.taxRate] Effective property-tax rate.
 * @param {number} [input.insuranceAnnual] Hazard insurance per year.
 * @param {number} [input.hoaMonthly] HOA dues per month.
 * @returns {{ down: number, loan: number, principalInterest: number, tax: number,
 *   insurance: number, hoa: number, pmi: number, total: number, ltv: number }}
 *   Every component, and the total.
 */
export function ownershipCost({
  price,
  downPct,
  rate,
  years = 30,
  taxRate = COUNTY_TAX_RATE,
  insuranceAnnual = null,
  hoaMonthly = 0,
}) {
  const down = Math.max(price * downPct, 0);
  const loan = Math.max(price - down, 0);
  const ltv = price > 0 ? loan / price : 0;
  const principalInterest = monthlyPayment(loan, rate, years);
  const tax = (price * taxRate) / 12;
  // Coastal California hazard cover runs near 0.35% of value a year when the
  // caller does not supply a real quote.
  const insurance = (insuranceAnnual ?? price * 0.0035) / 12;
  // Mortgage insurance applies above 80% loan-to-value; 0.55% a year of the
  // loan is a typical conforming rate.
  const pmi = ltv > 0.8 ? (loan * 0.0055) / 12 : 0;
  const total = principalInterest + tax + insurance + hoaMonthly + pmi;
  return { down, loan, principalInterest, tax, insurance, hoa: hoaMonthly, pmi, total, ltv };
}

/**
 * The price that fits a monthly budget, found by bisection.
 *
 * Solving `ownershipCost` backwards analytically is possible but brittle —
 * tax, insurance and PMI all move with the price. Bisection over a bounded
 * range is exact enough and cannot be wrong about the shape of the answer.
 *
 * @param {object} input The scenario.
 * @param {number} input.budget Monthly ceiling.
 * @param {number} input.downPct Down payment fraction.
 * @param {number} input.rate Annual rate.
 * @param {number} [input.years] Term.
 * @param {number} [input.hoaMonthly] HOA dues.
 * @returns {number} The affordable purchase price, rounded to $1,000.
 */
export function affordablePrice({ budget, downPct, rate, years = 30, hoaMonthly = 0 }) {
  if (budget <= hoaMonthly) return 0;
  let low = 0;
  let high = 25000000;
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    const { total } = ownershipCost({ price: mid, downPct, rate, years, hoaMonthly });
    if (total > budget) high = mid; else low = mid;
  }
  return Math.round(low / 1000) * 1000;
}

/**
 * Equity after a number of years, given a growth assumption.
 *
 * Two things build it at once: the loan amortising down and the property
 * appreciating up. The function returns both so the UI can show which is
 * doing the work — early on it is almost entirely appreciation.
 *
 * @param {object} input The scenario.
 * @param {number} input.price Purchase price.
 * @param {number} input.downPct Down payment fraction.
 * @param {number} input.rate Annual interest rate.
 * @param {number} input.years Years held.
 * @param {number} [input.appreciation] Annual appreciation, e.g. 0.04.
 * @param {number} [input.term] Loan term.
 * @returns {{ value: number, balance: number, equity: number, paidDown: number, gained: number }}
 *   The position at the end of the hold.
 */
export function equityAfter({ price, downPct, rate, years, appreciation = 0.04, term = 30 }) {
  const loan = price * (1 - downPct);
  const payment = monthlyPayment(loan, rate, term);
  const r = rate / 12;
  const months = Math.min(years * 12, term * 12);
  // Standard remaining-balance formula, guarding the zero-rate case.
  const balance = r === 0
    ? Math.max(loan - payment * months, 0)
    : Math.max(loan * (1 + r) ** months - payment * (((1 + r) ** months - 1) / r), 0);
  const value = price * (1 + appreciation) ** years;
  return {
    value,
    balance,
    equity: value - balance,
    paidDown: loan - balance,
    gained: value - price,
  };
}

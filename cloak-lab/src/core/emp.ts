/**
 * Defensive EMP hardening model in relative, conceptual units. Answers "which of my devices
 * survive a pulse, and which protection made the difference?" Pure and testable.
 *
 * E1: fast component, couples to conductors (cables, traces); stopped by shielding, filters, fibre.
 * E3: slow component, drives currents in very long lines (power grid); stopped by disconnection
 *     or neutral blocking devices. (E2 behaves like lightning and is covered by surge protection.)
 */
import { EMP, ENCLOSURES, type EnclosureId } from '../config/lab';

export interface Device {
  id: string;
  name: string;
  /** Effective conductor length exposed to the field (m): cables, antenna, harness. */
  conductorM: number;
  /** Voltage (V) at which it glitches / reboots, and is damaged. */
  upsetV: number;
  damageV: number;
  /** Length of grid / long line connected (km), 0 if none. */
  lineKm: number;
  info: string;
}

export const DEVICES: Device[] = [
  { id: 'cloak', name: 'Cloak controller (suit electronics)', conductorM: 1.5, upsetV: 300, damageV: 1200, lineKm: 0, info: 'Cameras, display drivers and the segmentation computer, wired through the suit.' },
  { id: 'phone', name: 'Smartphone (unplugged)', conductorM: 0.15, upsetV: 200, damageV: 1500, lineKm: 0, info: 'Short internal conductors: small devices couple little energy.' },
  { id: 'laptop', name: 'Laptop on charger', conductorM: 3, upsetV: 300, damageV: 1500, lineKm: 0.05, info: 'The charger cord and building wiring act as an antenna.' },
  { id: 'car', name: 'Car engine computer', conductorM: 2, upsetV: 400, damageV: 2500, lineKm: 0, info: 'Long wiring harness, partly shielded by the metal body (modelled as a shorter effective length).' },
  { id: 'radio', name: 'Radio with roof antenna', conductorM: 10, upsetV: 150, damageV: 900, lineKm: 0, info: 'Antennas are designed to collect fields — the most exposed electronics.' },
  { id: 'inverter', name: 'Solar inverter', conductorM: 20, upsetV: 600, damageV: 3000, lineKm: 0.5, info: 'Panel strings and the grid connection are long conductors.' },
  { id: 'transformer', name: 'Grid transformer', conductorM: 0, upsetV: 0.5, damageV: 1.2, lineKm: 150, info: 'Damaged by slow E3 currents in very long lines, not by E1. Thresholds here are relative stress units.' },
];

export interface Protection {
  enclosure: EnclosureId;
  /** Surge / filter protection on every conductor that enters the device. */
  filters: boolean;
  /** Data links replaced by optical fibre (cuts conductor length in half, roughly). */
  fiber: boolean;
  /** Disconnected from long lines (or neutral blocking device fitted). */
  isolated: boolean;
}

export const NO_PROTECTION: Protection = { enclosure: 'none', filters: false, fiber: false, isolated: false };

export type Outcome = 'ok' | 'upset' | 'damaged';

export interface DeviceResult {
  device: Device;
  /** Stress at the device: volts for E1, relative units for E3. */
  e1V: number;
  e3: number;
  outcome: Outcome;
  /** Which effect dominated. */
  cause: 'E1' | 'E3' | 'none';
  /** Margin: worst stress / damage threshold (≥ 1 → damaged). */
  ratio: number;
}

export function e1FieldVPerM(threat: number): number {
  return Math.max(0, threat) * EMP.e1RefKvPerM * 1000;
}

/** Shielding effectiveness (dB) → field attenuation factor. */
export const shieldFactor = (seDb: number) => Math.pow(10, -seDb / 20);

export function evaluate(device: Device, p: Protection, threat: number): DeviceResult {
  const se = ENCLOSURES[p.enclosure].seDb;
  const length = device.conductorM * (p.fiber ? 0.5 : 1);
  let e1V = e1FieldVPerM(threat) * length * EMP.coupling * shieldFactor(se);
  if (p.filters && e1V > EMP.filterLetThrough) e1V = EMP.filterLetThrough;
  const e3 = p.isolated ? 0 : threat * device.lineKm * EMP.e3PerKm;

  const isE3Device = device.id === 'transformer';
  const stress = isE3Device ? e3 : e1V;
  const ratio = stress / device.damageV;
  let outcome: Outcome = 'ok';
  if (stress >= device.damageV) outcome = 'damaged';
  else if (stress >= device.upsetV) outcome = 'upset';
  // Long-line surges also hit ordinary devices through their power cord if unprotected.
  if (!isE3Device && !p.isolated && !p.filters && device.lineKm > 0 && threat > 0.5 && outcome === 'ok') outcome = 'upset';
  const cause: DeviceResult['cause'] = outcome === 'ok' ? 'none' : isE3Device ? 'E3' : 'E1';
  return { device, e1V, e3, outcome, cause, ratio };
}

export function protectionCost(p: Protection): { cost: number; kg: number } {
  const e = ENCLOSURES[p.enclosure];
  return { cost: e.cost + (p.filters ? 25 : 0) + (p.fiber ? 60 : 0) + (p.isolated ? 10 : 0), kg: e.kg + (p.filters ? 0.2 : 0) + (p.fiber ? 0.1 : 0) };
}

/** How long the live cloak is down after a pulse (s); Infinity = needs repair. */
export function cloakDowntime(outcome: Outcome): number {
  return outcome === 'ok' ? 0.4 : outcome === 'upset' ? 4 : Infinity;
}

export function explain(r: DeviceResult, p: Protection): string {
  const d = r.device;
  if (d.id === 'transformer') {
    return r.outcome === 'ok'
      ? 'E3 currents blocked — isolation / neutral blocking keeps quasi-DC current out of the transformer.'
      : `${d.lineKm} km of line collects slow E3 current that saturates the transformer core. Only isolation helps; a Faraday box cannot.`;
  }
  if (r.outcome === 'ok') {
    const helped: string[] = [];
    if (p.enclosure !== 'none') helped.push(`${ENCLOSURES[p.enclosure].name.toLowerCase()} (−${ENCLOSURES[p.enclosure].seDb} dB)`);
    if (p.filters) helped.push('filters clamping surges');
    if (p.fiber) helped.push('fibre data links');
    return helped.length ? `Survives thanks to ${helped.join(', ')}.` : 'Survives: short conductors couple little energy at this threat level.';
  }
  return `${Math.round(r.e1V)} V induced on ${d.conductorM} m of conductors vs ${r.outcome === 'damaged' ? d.damageV : d.upsetV} V ${
    r.outcome === 'damaged' ? 'damage' : 'upset'
  } threshold. Add shielding, filters or shorter (fibre) links.`;
}

import type { SystemId } from '../types';

export interface SystemStyle {
  label: string;
  /** Bullet colour in the UI. */
  swatch: string;
  /** Surface colour in the scene (slightly lighter, tuned for the studio light). */
  color: string;
  roughness: number;
  /** Singular noun used in descriptions. */
  noun: string;
}

// Muted, specimen-like palette. Nothing saturated, nothing neon.
export const SYSTEM_STYLE: Record<SystemId, SystemStyle> = {
  skeleton: { label: 'Skeleton', swatch: '#CDBF9F', color: '#E6DDC8', roughness: 0.62, noun: 'skeletal' },
  muscles: { label: 'Muscles', swatch: '#B7685C', color: '#C47D6F', roughness: 0.5, noun: 'muscular' },
  heart: { label: 'Heart', swatch: '#9E3B3B', color: '#B04B48', roughness: 0.45, noun: 'cardiac' },
  sensory: { label: 'Sensory organs', swatch: '#8FA3AA', color: '#D5DCDC', roughness: 0.3, noun: 'sensory' },
  arteries: { label: 'Arteries', swatch: '#C0453C', color: '#C9574B', roughness: 0.4, noun: 'arterial' },
  veins: { label: 'Veins', swatch: '#4B6A99', color: '#5D79A6', roughness: 0.4, noun: 'venous' },
  nervous: { label: 'Nervous system', swatch: '#D3B15E', color: '#E3CD93', roughness: 0.55, noun: 'neural' },
  respiratory: { label: 'Respiratory', swatch: '#C99597', color: '#DDB2B1', roughness: 0.55, noun: 'respiratory' },
};

export const PRESETS: Record<'all' | 'skeleton' | 'organs', SystemId[]> = {
  all: ['skeleton', 'muscles', 'heart', 'sensory', 'arteries', 'veins', 'nervous', 'respiratory'],
  skeleton: ['skeleton'],
  organs: ['heart', 'sensory', 'arteries', 'veins', 'nervous', 'respiratory'],
};

export const BACKGROUND = '#F3F3F1';

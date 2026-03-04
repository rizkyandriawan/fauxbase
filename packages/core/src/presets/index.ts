import type { Preset } from './types';
import { defaultPreset } from './default';
import { springBootPreset } from './spring-boot';
import { laravelPreset } from './laravel';
import { djangoPreset } from './django';
import { nestjsPreset } from './nestjs';
import { expressPreset } from './express';

export type { Preset, FilterStyle } from './types';
export { definePreset } from './types';

const presetRegistry = new Map<string, Preset>([
  ['default', defaultPreset],
  ['spring-boot', springBootPreset],
  ['laravel', laravelPreset],
  ['django', djangoPreset],
  ['nestjs', nestjsPreset],
  ['express', expressPreset],
]);

export function getPreset(name: string): Preset {
  const preset = presetRegistry.get(name);
  if (!preset) {
    throw new Error(`Unknown preset: "${name}". Available: ${Array.from(presetRegistry.keys()).join(', ')}`);
  }
  return preset;
}

export { defaultPreset, springBootPreset, laravelPreset, djangoPreset, nestjsPreset, expressPreset };

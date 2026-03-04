import type { FieldOptions, HookType } from './types';

// Field metadata: Map<Constructor, Map<fieldName, FieldOptions>>
const fieldRegistry = new Map<Function, Map<string, FieldOptions>>();

// Relation metadata: Map<Constructor, Map<fieldName, targetEntityName>>
const relationRegistry = new Map<Function, Map<string, string>>();

// Computed metadata: Map<Constructor, Map<fieldName, computeFn>>
const computedRegistry = new Map<Function, Map<string, (entity: any) => any>>();

// Hook metadata: Map<Constructor, Map<HookType, methodName[]>>
const hookRegistry = new Map<Function, Map<HookType, string[]>>();

// --- Register ---

export function registerField(target: Function, propertyKey: string, options: FieldOptions): void {
  if (!fieldRegistry.has(target)) fieldRegistry.set(target, new Map());
  fieldRegistry.get(target)!.set(propertyKey, options);
}

export function registerRelation(target: Function, propertyKey: string, entityName: string): void {
  if (!relationRegistry.has(target)) relationRegistry.set(target, new Map());
  relationRegistry.get(target)!.set(propertyKey, entityName);
}

export function registerComputed(target: Function, propertyKey: string, fn: (entity: any) => any): void {
  if (!computedRegistry.has(target)) computedRegistry.set(target, new Map());
  computedRegistry.get(target)!.set(propertyKey, fn);
}

export function registerHook(target: Function, hookType: HookType, methodName: string): void {
  if (!hookRegistry.has(target)) hookRegistry.set(target, new Map());
  const hooks = hookRegistry.get(target)!;
  if (!hooks.has(hookType)) hooks.set(hookType, []);
  hooks.get(hookType)!.push(methodName);
}

// --- Read ---

export function getFieldMeta(target: Function): Map<string, FieldOptions> {
  return fieldRegistry.get(target) ?? new Map();
}

export function getRelationMeta(target: Function): Map<string, string> {
  return relationRegistry.get(target) ?? new Map();
}

export function getComputedMeta(target: Function): Map<string, (entity: any) => any> {
  return computedRegistry.get(target) ?? new Map();
}

export function getHooks(target: Function, hookType: HookType): string[] {
  return hookRegistry.get(target)?.get(hookType) ?? [];
}

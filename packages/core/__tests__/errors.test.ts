import { describe, it, expect } from 'vitest';
import { FauxbaseError, NotFoundError, ConflictError, ValidationError, ForbiddenError } from '../src/errors';

describe('FauxbaseError', () => {
  it('stores message, code, and details', () => {
    const err = new FauxbaseError('fail', 'TEST', { field: 'bad' });
    expect(err.message).toBe('fail');
    expect(err.code).toBe('TEST');
    expect(err.details).toEqual({ field: 'bad' });
    expect(err.name).toBe('FauxbaseError');
    expect(err).toBeInstanceOf(Error);
  });

  it('toJSON returns payload', () => {
    const err = new FauxbaseError('fail', 'TEST', { x: 'y' });
    expect(err.toJSON()).toEqual({ error: 'fail', code: 'TEST', details: { x: 'y' } });
  });

  it('toJSON omits details when undefined', () => {
    const err = new FauxbaseError('fail', 'TEST');
    expect(err.toJSON()).toEqual({ error: 'fail', code: 'TEST', details: undefined });
  });
});

describe('NotFoundError', () => {
  it('has correct defaults', () => {
    const err = new NotFoundError();
    expect(err.message).toBe('Resource not found');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('NotFoundError');
    expect(err).toBeInstanceOf(FauxbaseError);
  });

  it('accepts custom message', () => {
    const err = new NotFoundError('User not found');
    expect(err.message).toBe('User not found');
  });
});

describe('ConflictError', () => {
  it('has correct defaults', () => {
    const err = new ConflictError();
    expect(err.code).toBe('CONFLICT');
    expect(err.name).toBe('ConflictError');
    expect(err).toBeInstanceOf(FauxbaseError);
  });
});

describe('ValidationError', () => {
  it('has correct defaults and details', () => {
    const err = new ValidationError('Bad input', { name: 'required' });
    expect(err.code).toBe('VALIDATION');
    expect(err.name).toBe('ValidationError');
    expect(err.details).toEqual({ name: 'required' });
    expect(err).toBeInstanceOf(FauxbaseError);
  });
});

describe('ForbiddenError', () => {
  it('has correct defaults', () => {
    const err = new ForbiddenError();
    expect(err.code).toBe('FORBIDDEN');
    expect(err.name).toBe('ForbiddenError');
    expect(err).toBeInstanceOf(FauxbaseError);
  });
});

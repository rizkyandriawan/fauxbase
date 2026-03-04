import type { FauxbaseErrorPayload } from './types';

export class FauxbaseError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, string>;

  constructor(message: string, code: string, details?: Record<string, string>) {
    super(message);
    this.name = 'FauxbaseError';
    this.code = code;
    this.details = details;
  }

  toJSON(): FauxbaseErrorPayload {
    return { error: this.message, code: this.code, details: this.details };
  }
}

export class NotFoundError extends FauxbaseError {
  constructor(message = 'Resource not found') {
    super(message, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends FauxbaseError {
  constructor(message = 'Resource conflict') {
    super(message, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class ValidationError extends FauxbaseError {
  constructor(message = 'Validation failed', details?: Record<string, string>) {
    super(message, 'VALIDATION', details);
    this.name = 'ValidationError';
  }
}

export class ForbiddenError extends FauxbaseError {
  constructor(message = 'Access forbidden') {
    super(message, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class NetworkError extends FauxbaseError {
  constructor(message = 'Network request failed') {
    super(message, 'NETWORK');
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends FauxbaseError {
  constructor(message = 'Request timed out') {
    super(message, 'TIMEOUT');
    this.name = 'TimeoutError';
  }
}

export class HttpError extends FauxbaseError {
  public readonly status: number;

  constructor(message: string, status: number, details?: Record<string, string>) {
    super(message, 'HTTP', details);
    this.name = 'HttpError';
    this.status = status;
  }

  toJSON() {
    return { ...super.toJSON(), status: this.status };
  }
}

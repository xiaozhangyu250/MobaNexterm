import { describe, expect, it } from 'vitest';
import { AppError, toAppError } from '../../src/main/utils/errors';

describe('toAppError', () => {
  it('returns an existing AppError unchanged', () => {
    const error = new AppError('failed', 'SSH_FAILED');

    expect(toAppError(error)).toBe(error);
  });

  it('wraps Error instances and preserves the cause', () => {
    const cause = new Error('connection refused');
    const error = toAppError(cause, 'SSH_FAILED');

    expect(error).toMatchObject({
      name: 'AppError',
      message: 'connection refused',
      code: 'SSH_FAILED',
      cause,
    });
  });

  it('converts non-Error values to a useful message', () => {
    expect(toAppError('timed out')).toMatchObject({
      message: 'timed out',
      code: 'UNKNOWN',
    });
  });
});

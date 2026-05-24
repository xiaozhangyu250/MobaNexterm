export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'APP_ERROR',
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function toAppError(err: unknown, fallbackCode = 'UNKNOWN'): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Error) return new AppError(err.message, fallbackCode, err);
  return new AppError(String(err), fallbackCode);
}

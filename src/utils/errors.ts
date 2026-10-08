export interface AppError extends Error { code?: string }
export function asError(value: unknown): AppError {
  if (value instanceof Error) return value;
  if (value && typeof value === 'object' && 'message' in value) {
    const error: AppError = new Error(String(value.message));
    if ('code' in value && typeof value.code === 'string') error.code = value.code;
    return error;
  }
  return new Error(typeof value === 'string' ? value : 'No se pudo completar la operación.');
}

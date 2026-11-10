export const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isAllowedOrigin(
  method: string,
  origin: string | undefined,
  applicationUrl: string,
): boolean {
  if (!MUTATING_METHODS.has(method.toUpperCase())) {
    return true;
  }

  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).origin === new URL(applicationUrl).origin;
  } catch {
    return false;
  }
}

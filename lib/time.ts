export function nowIso(): string {
  return new Date().toISOString();
}

export function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60_000).toISOString();
}

export function isExpired(iso: string): boolean {
  return Date.parse(iso) <= Date.now();
}

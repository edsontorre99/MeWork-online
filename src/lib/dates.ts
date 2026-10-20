// Utilidades de fecha. Los días se guardan como "YYYY-MM-DD" en hora local.

export const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Lunes de la semana de la fecha dada. */
export function startOfWeek(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (r.getDay() + 6) % 7; // 0 = lunes
  return addDays(r, -dow);
}

export function weekDays(d: Date = new Date()): string[] {
  const start = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => toISODate(addDays(start, i)));
}

/** "Lunes, 19 de Octubre de 2026" */
export function longSpanishDate(d: Date): string {
  const dow = DAY_NAMES[(d.getDay() + 6) % 7];
  return `${dow}, ${d.getDate()} de ${MONTH_NAMES[d.getMonth()]} de ${d.getFullYear()}`;
}

/** "19 oct" */
export function shortSpanishDate(s: string): string {
  const d = fromISODate(s);
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3).toLowerCase()}`;
}

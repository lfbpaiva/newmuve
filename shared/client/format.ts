const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const monthShort = new Intl.DateTimeFormat("pt-BR", { month: "short" });

export const formatCurrency = (value: number) => currency.format(value);

/** "15/08/2030, 20:00" → "15/08/2030 às 20:00" */
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso)).replace(", ", " às ");

export const dayOfMonth = (iso: string) => String(new Date(iso).getDate()).padStart(2, "0");

export const monthLabel = (iso: string) => monthShort.format(new Date(iso)).replace(".", "").toUpperCase();

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** Data local no formato de <input type="date">. */
export const toDateInput = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Hora local no formato de <input type="time">. */
export const toTimeInput = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

export const minutesToTimeInput = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

export function timeInputToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatCountdown(totalSeconds: number): string {
  return `${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`;
}

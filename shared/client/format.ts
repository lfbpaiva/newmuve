import { fusoDaUf } from "../dominio.ts";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export const formatCurrency = (value: number) => currency.format(value);

export const parseValor = (input: string) => Number(input.replace(/\./g, "").replace(",", "."));

export const toValorInput = (value: number) => String(value).replace(".", ",");

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso)).replace(", ", " às ");

export function eventDateParts(iso: string, uf: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", { timeZone: fusoDaUf(uf), day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  const mes = new Intl.DateTimeFormat("pt-BR", { timeZone: fusoDaUf(uf), month: "short" }).format(new Date(iso)).replace(".", "").toUpperCase();
  return {
    day: parts.day,
    month: mes,
    time: `${parts.hour}:${parts.minute}`,
    data: `${parts.day}/${parts.month}/${parts.year}`,
    texto: `${parts.day}/${parts.month}/${parts.year} às ${parts.hour}:${parts.minute}`,
  };
}

export const formatEventDateTime = (iso: string, uf: string) => eventDateParts(iso, uf).texto;

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`;
}

const pad = (value: number) => String(value).padStart(2, "0");

export const minutesToTimeInput = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

export function timeInputToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatCountdown(totalSeconds: number): string {
  return `${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`;
}

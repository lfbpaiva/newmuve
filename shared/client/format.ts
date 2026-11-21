import { fusoDaUf, type EstimativaDoContratante } from "../dominio.ts";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export const formatCurrency = (value: number) => currency.format(value);

const MILHAR_COM_PONTO = /^\d{1,3}(\.\d{3})+$/;
const DECIMAL_COM_PONTO = /^\d+\.\d{1,2}$/;
const VALOR_NORMALIZADO = /^\d+(\.\d{1,2})?$/;

export function parseValor(input: string): number {
  const texto = input.trim();
  let normalizado = texto;
  if (texto.includes(",")) normalizado = texto.replace(/\./g, "").replace(",", ".");
  else if (MILHAR_COM_PONTO.test(texto)) normalizado = texto.replace(/\./g, "");
  else if (texto.includes(".") && !DECIMAL_COM_PONTO.test(texto)) return Number.NaN;
  return VALOR_NORMALIZADO.test(normalizado) ? Number(normalizado) : Number.NaN;
}

export const toValorInput = (value: number) => String(value).replace(".", ",");

const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });

export const formatTotalDoContratante = (estimativa: EstimativaDoContratante) => `Você paga ${formatCurrency(estimativa.total)} se aprovar agora`;

export const formatTotalDaInscricao = (estimativa: EstimativaDoContratante) =>
  `Para aprovar a inscrição de ${formatCurrency(estimativa.cache)}, você paga ${formatCurrency(estimativa.total)}`;

export const formatTotalSeAceita =(estimativa: EstimativaDoContratante) => `Se esta proposta for aceita, você pagará ${formatCurrency(estimativa.total)} ao aprovar`;

export function detalharTotalDoContratante(estimativa: EstimativaDoContratante): string {
  const taxa = estimativa.casaAte ? `taxa de ${estimativa.percentual}% do Muve Casa, válida até ${dataCurta.format(estimativa.casaAte)}` : `taxa de ${estimativa.percentual}%`;
  return `${formatCurrency(estimativa.cache)} de cachê + ${formatCurrency(estimativa.comissao)} de ${taxa}. O valor final é calculado no pagamento.`;
}

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso)).replace(", ", " às ");

export function eventDateParts(iso: string, uf: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", { timeZone: fusoDaUf(uf), day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  const mes = new Intl.DateTimeFormat("pt-BR", { timeZone: fusoDaUf(uf), month: "short" }).format(new Date(iso)).replace(".", "").toUpperCase();
  const semana = new Intl.DateTimeFormat("pt-BR", { timeZone: fusoDaUf(uf), weekday: "short" }).format(new Date(iso)).replace(".", "").toUpperCase();
  return {
    day: parts.day,
    month: mes,
    weekday: semana,
    cartaz: `${semana} ${parts.day} ${mes} · ${parts.hour}H${parts.minute === "00" ? "" : parts.minute}`,
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

export function completarHorario(value: string): string {
  const digitos = value.replace(/\D/g, "").slice(0, 4);
  if (digitos.length === 0) return "";
  if (digitos.length <= 2) return `${digitos.padStart(2, "0")}:00`;
  return `${digitos.slice(0, 2)}:${digitos.slice(2).padEnd(2, "0")}`;
}

export function timeInputToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatCountdown(totalSeconds: number): string {
  return `${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`;
}

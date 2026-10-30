import { fusoDaUf } from "./dominio.ts";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const formatCurrency = (value: number) => currency.format(value);

export const formatDateTime = (date: Date | string, uf = "SP") =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: fusoDaUf(uf) }).format(new Date(date)).replace(", ", " às ");

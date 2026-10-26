const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export const formatCurrency = (value: number) => currency.format(value);

export const formatDateTime = (date: Date | string) => dateTime.format(new Date(date)).replace(", ", " às ");

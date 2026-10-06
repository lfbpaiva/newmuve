// Formatação em português do Brasil, usada no frontend e nos e-mails do backend.

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export const formatCurrency = (value: number) => currency.format(value);

/** "15/08/2030, 20:00" → "15/08/2030 às 20:00" (horário de Brasília). */
export const formatDateTime = (date: Date | string) => dateTime.format(new Date(date)).replace(", ", " às ");

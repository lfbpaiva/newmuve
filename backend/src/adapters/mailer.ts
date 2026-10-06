import nodemailer from "nodemailer";
import type { Mailer } from "../services/notifications.ts";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

/** Envio por SMTP (Resend, Brevo, Gmail...), o mesmo provedor configurado no Supabase Auth. */
export function createSmtpMailer(config: SmtpConfig): Mailer {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });
  return {
    async send(message) {
      await transport.sendMail({ from: config.from, ...message });
    },
  };
}

/** Sem SMTP configurado, os e-mails só aparecem no log do servidor. */
export function createLogMailer(): Mailer {
  return {
    async send(message) {
      console.log(`[e-mail não enviado: SMTP não configurado] para ${message.to} — ${message.subject}`);
    },
  };
}

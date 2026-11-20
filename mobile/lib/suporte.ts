import { EMAIL_SUPORTE } from "../../shared/dominio.ts";
import { abrirLink } from "./links";

const SEM_APP_DE_EMAIL = `Não encontramos um app de e-mail neste aparelho. Escreva para ${EMAIL_SUPORTE}.`;

export function escreverParaSuporte(assunto: string, onError: (message: string) => void, corpo?: string) {
  const query = `subject=${encodeURIComponent(assunto)}${corpo === undefined ? "" : `&body=${encodeURIComponent(corpo)}`}`;
  abrirLink(`mailto:${EMAIL_SUPORTE}?${query}`, onError, SEM_APP_DE_EMAIL);
}

export function denunciar(nome: string, contexto: string, emailDeQuemDenuncia: string, onError: (message: string) => void) {
  escreverParaSuporte(
    `Muve: denúncia sobre ${nome}`,
    onError,
    `Quero denunciar ${nome} (${contexto}).\n\nO que aconteceu:\n\n\nMinha conta: ${emailDeQuemDenuncia}`,
  );
}

export function pedirCopiaDosDados(email: string, onError: (message: string) => void) {
  escreverParaSuporte("Muve: cópia dos meus dados", onError, `Peço uma cópia dos dados que a Muve guarda sobre a minha conta, conforme a LGPD.\n\nMinha conta: ${email}`);
}

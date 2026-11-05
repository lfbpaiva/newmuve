import { Linking } from "react-native";
import { EMAIL_SUPORTE } from "../../shared/dominio.ts";

function escreverParaSuporte(assunto: string, corpo: string) {
  void Linking.openURL(`mailto:${EMAIL_SUPORTE}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`);
}

export function denunciar(nome: string, contexto: string, emailDeQuemDenuncia: string) {
  escreverParaSuporte(
    `Muve: denúncia sobre ${nome}`,
    `Quero denunciar ${nome} (${contexto}).\n\nO que aconteceu:\n\n\nMinha conta: ${emailDeQuemDenuncia}`,
  );
}

export function pedirCopiaDosDados(email: string) {
  escreverParaSuporte("Muve: cópia dos meus dados", `Peço uma cópia dos dados que a Muve guarda sobre a minha conta, conforme a LGPD.\n\nMinha conta: ${email}`);
}

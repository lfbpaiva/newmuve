import { Linking } from "react-native";

export const LINK_INDISPONIVEL = "Não foi possível abrir este link neste aparelho.";

export function abrirLink(url: string, onError: (message: string) => void, mensagem = LINK_INDISPONIVEL): void {
  Linking.openURL(url).catch(() => onError(mensagem));
}

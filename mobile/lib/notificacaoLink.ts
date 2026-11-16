const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const DESTINOS = [
  new RegExp(`^/event/${UUID}$`, "i"),
  new RegExp(`^/event/${UUID}/hiring$`, "i"),
  new RegExp(`^/conversa/${UUID}$`, "i"),
  /^\/(pro|casa|notificacoes)$/,
];

export function destinoDaNotificacao(link: unknown): string | null {
  if (typeof link !== "string") return null;
  const destino = link.trim();
  return DESTINOS.some((padrao) => padrao.test(destino)) ? destino : null;
}

export function chaveDaAbertura(resposta: { actionIdentifier?: string; notification: { request: { identifier: string } } }): string {
  return `${resposta.notification.request.identifier}:${resposta.actionIdentifier ?? ""}`;
}

export function criarRegistroDeAberturas(limite = 50) {
  const abertas: string[] = [];
  return (chave: string): boolean => {
    if (abertas.includes(chave)) return false;
    abertas.push(chave);
    if (abertas.length > limite) abertas.shift();
    return true;
  };
}

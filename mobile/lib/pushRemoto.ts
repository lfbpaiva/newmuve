export function pushRemotoDisponivel({ plataforma, dispositivoFisico, expoGo }: { plataforma: string; dispositivoFisico: boolean; expoGo: boolean }): boolean {
  if (plataforma === "web" || !dispositivoFisico) return false;
  return !(expoGo && plataforma === "android");
}

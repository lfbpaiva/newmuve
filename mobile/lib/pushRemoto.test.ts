import { describe, expect, it } from "vitest";
import { pushRemotoDisponivel } from "./pushRemoto.ts";

describe("pushRemotoDisponivel", () => {
  it("Expo Go no Android não tem push remoto desde o SDK 53: o módulo não é carregado", () => {
    expect(pushRemotoDisponivel({ plataforma: "android", dispositivoFisico: true, expoGo: true })).toBe(false);
  });

  it("build de desenvolvimento ou de produção no Android continua com push", () => {
    expect(pushRemotoDisponivel({ plataforma: "android", dispositivoFisico: true, expoGo: false })).toBe(true);
  });

  it("iPhone continua com push, inclusive no Expo Go", () => {
    expect(pushRemotoDisponivel({ plataforma: "ios", dispositivoFisico: true, expoGo: true })).toBe(true);
    expect(pushRemotoDisponivel({ plataforma: "ios", dispositivoFisico: true, expoGo: false })).toBe(true);
  });

  it("navegador e emulador não usam push, como antes", () => {
    expect(pushRemotoDisponivel({ plataforma: "web", dispositivoFisico: true, expoGo: false })).toBe(false);
    expect(pushRemotoDisponivel({ plataforma: "android", dispositivoFisico: false, expoGo: false })).toBe(false);
  });
});

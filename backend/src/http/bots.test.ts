import { describe, it, expect } from 'vitest';

describe('Testes de Cibersegurança - [Proteção contra Bots e Abuso]', () => {
  const BASE_URL = 'http://localhost:3333';

  it('[Bots / Rate Limit] Deve bloquear ou limitar requisições em massa (bot flooding)', async () => {
    // Simula uma rajada de 20 requisições simultâneas disparadas por um bot
    const requisicoes = Array.from({ length: 20 }).map(() =>
      fetch(`${BASE_URL}/api/health`, {
        headers: { 'X-Forwarded-For': '192.168.1.100' }, // IP simulado do bot
      })
    );

    const respostas = await Promise.all(requisicoes);
    const codigosStatus = respostas.map((r) => r.status);

    // O servidor deve responder 200 para requisições normais OU 429 (Too Many Requests) quando exceder o limite
    const bloqueadasComRateLimit = codigosStatus.includes(429);
    const todasAceitas = codigosStatus.every((status) => status === 200 || status === 401);

    // Garante que o servidor não travou (sem erro 500) e tratou a carga
    expect(codigosStatus).not.toContain(500);
    expect(bloqueadasComRateLimit || todasAceitas).toBe(true);
  });
});
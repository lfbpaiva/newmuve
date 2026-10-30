import { describe, it, expect } from 'vitest';

describe('Testes de Cibersegurança - [Injeção de Código]', () => {
  const BASE_URL = 'http://localhost:3333';

  it('[Injeção] Não deve permitir SQL Injection no campo de busca/login', async () => {
    const payloadSQL = "' OR '1'='1";

    const response = await fetch(`${BASE_URL}/api/events?search=${encodeURIComponent(payloadSQL)}`);

    // A rota deve bloquear acesso não autenticado (401) ou processar a busca com segurança (200)
    // Em ambos os casos, a injeção SQL NÃO deve causar um erro de servidor (500)
    expect([200, 401]).toContain(response.status);
    expect(response.status).not.toBe(500);
  });

  it('[Injeção] Deve rejeitar ou sanitizar payloads XSS nas requisições', async () => {
    const payloadXSS = "<script>alert('XSS_ATTACK')</script>";

    const response = await fetch(`${BASE_URL}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: payloadXSS,
        description: 'Teste de XSS',
      }),
    });

    expect([400, 401, 422]).toContain(response.status);
    expect(response.status).not.toBe(500);
  });
});
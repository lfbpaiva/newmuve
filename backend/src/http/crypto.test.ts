import { describe, it, expect } from 'vitest';

describe('Testes de Cibersegurança - [Criptografia e Senhas]', () => {
  const BASE_URL = 'http://localhost:3333';

  it('[Segurança de Senhas] Não deve aceitar cadastro/login com senha fraca ou em branco', async () => {
    const response = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'teste_seguranca@exemplo.com',
        password: '123', // Senha fraca/curta
      }),
    });

    // O servidor DEVE recusar senhas fracas (Status 400 Bad Request)
    expect([400, 422]).toContain(response.status);
  });

  it('[Proteção de Dados] Resposta de perfil não deve expor a senha do usuário', async () => {
    // Simula a busca de dados de um usuário
    const response = await fetch(`${BASE_URL}/api/accounts/me`);
    const data = await response.json();

    // Garante que o payload retornado NUNCA contenha o campo password/hash
    expect(data.password).toBeUndefined();
    expect(data.password_hash).toBeUndefined();
    expect(data.hash).toBeUndefined();
  });
});
import { describe, it, expect } from 'vitest';

describe('Testes de Cibersegurança - [Vulnerabilidade IDOR]', () => {
  const BASE_URL = 'http://localhost:3333';

  // Tokens simulados de dois usuários distintos
  const tokenUsuarioB_Atacante = 'TOKEN_VALIDO_USUARIO_ATACANTE';

  // ID de um evento pertencente ao Usuário A
  const idEventoDoUsuarioA = 'e7b8c120-1234-4a5b-8c00-000000000001';

  it('[IDOR] Não deve permitir que o Usuário B altere um evento do Usuário A', async () => {
    const response = await fetch(`${BASE_URL}/api/events/${idEventoDoUsuarioA}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenUsuarioB_Atacante}`,
      },
      body: JSON.stringify({
        title: 'Evento Alterado por Ataque IDOR',
        price: 0,
      }),
    });

    // O sistema DEVE negar a requisição enviando status 401, 403 ou 404
    expect([401, 403, 404]).toContain(response.status);
  });

  it('[IDOR] Não deve permitir que o Usuário B exclua um evento do Usuário A', async () => {
    const response = await fetch(`${BASE_URL}/api/events/${idEventoDoUsuarioA}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${tokenUsuarioB_Atacante}`,
      },
    });

    expect([401, 403, 404]).toContain(response.status);
  });
});
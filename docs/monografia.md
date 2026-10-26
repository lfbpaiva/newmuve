# Texto sugerido para atualizar a monografia

Trechos prontos para substituir ou complementar as seções do documento "Projeto Acadêmico - Aplicativo Muve". A justificativa de cada mudança está em [produto.md](produto.md), seções 8 e 9.

## 1.3 Objetivos específicos (versão alinhada ao que foi construído)

- Mapear as principais dificuldades e riscos nas negociações diretas entre artistas e contratantes.
- Implementar um sistema de correspondência entre eventos e músicos por estilo musical e distância (mesma cidade ou até 200 km).
- Integrar um gateway de pagamentos (Asaas) capaz de receber o valor via Pix, mantê-lo retido e repassar o cachê ao músico mediante a confirmação de realização do evento.
- Definir regras objetivas de cancelamento, desistência e não comparecimento, com devolução ou repasse automáticos conforme a antecedência.
- Criar um sistema de avaliação mútua e um canal de negociação (proposta de cachê e conversa) dentro da plataforma.

## 4.2 Fontes de receita

- **Taxa de serviço:** 10% somados ao valor do cachê e pagos pelo contratante. O músico recebe o cachê integral combinado.
- **Trabalho futuro:** plano Premium para artistas (destaque no feed) e taxas de quebra de contrato.

## 4.4.1 Regras de negócio (como implementadas)

- **RN01:** a plataforma cobra uma taxa de serviço de 10%, somada ao cachê e paga pelo contratante.
- **RN02:** o valor pago fica retido na plataforma. O cachê é transferido ao músico por Pix após a confirmação das duas partes, ou 7 dias após a data do evento se nenhuma ocorrência for registrada.
- **RN03:** o contratante que cancela com mais de 24 horas de antecedência recebe o valor integral de volta.
- **RN04:** o contratante que cancela com menos de 24 horas não recebe devolução; o cachê é repassado ao músico.
- **RN05:** se o músico não comparecer, o contratante registra a ausência em até 7 dias e recebe o valor integral de volta. Se o músico desistir antes do evento, o contratante recebe tudo de volta e o evento volta a receber inscrições.
- **RN06:** todo evento tem data, horário de início (no fuso do estado), duração e cachê mínimo de R$ 100,00.
- **RN07:** o evento só aparece para músicos com estilo compatível, na mesma cidade ou num raio de até 200 km.
- **RN08:** o músico pode aceitar o cachê oferecido ou propor outro valor; a cobrança usa sempre o valor gravado na inscrição.
- **RN09:** CPF/CNPJ e chave Pix nunca são exibidos a terceiros; endereço e telefone só após a contratação.
- **RN10:** um músico não pode ser contratado para dois shows em horários sobrepostos.

## 4.4.2 Requisitos funcionais (como implementados)

- **RF01:** cadastro de músico ou contratante com aceite dos Termos de Uso, confirmação de e-mail e perfil completado conforme a necessidade (CPF/CNPJ validado).
- **RF02:** feed do músico filtrado por estilo e por distância (minha cidade, 50, 100 ou 200 km).
- **RF03:** criação, edição e exclusão de eventos com foto, data, horário, duração, local, estilos e cachê; encerramento e reabertura das inscrições.
- **RF04:** inscrição com proposta de cachê e conversa entre músico e contratante.
- **RF05:** aprovação do músico com pagamento via Pix (QR Code) e confirmação automática.
- **RF06:** retenção do valor e repasse do cachê ao músico por Pix.
- **RF07:** confirmação de realização do evento por ambas as partes (duplo OK).
- **RF08:** cancelamento, desistência e não comparecimento com devolução ou repasse automáticos.
- **RF09:** avaliação mútua por estrelas, liberada após a conclusão.
- **RF10:** notificações dentro do aplicativo, em tempo real.

## 4.4.3 Requisitos não funcionais (como implementados)

- **RNF01 – Segurança:** o aplicativo só lê dados permitidos pelas regras de acesso do banco (Row Level Security); toda escrita passa pela API, que valida permissões, regras e valores. Chaves privadas ficam apenas no servidor.
- **RNF02 – Arquitetura:** aplicativo em React Native (Expo), que roda em Android, iOS e navegador; API REST em Node.js (Hono); banco PostgreSQL, autenticação e arquivos no Supabase; pagamentos pela Asaas.
- **RNF03 – Auditoria:** avisos do gateway registrados para evitar processamento duplicado; datas de criação e atualização em todas as tabelas.
- **RNF04 – Confiabilidade:** pagamento confirmado por aviso do gateway (webhook) ou por consulta ativa; operações de pagamento, devolução e repasse protegidas contra duplicidade.
- **RNF05 – Qualidade:** 209 testes automatizados de regras e da API e 103 testes do banco de dados.

## 4.5 Protótipo

A tela "Contratos" do protótipo foi substituída pelo **comprovante da contratação**, que reúne endereço, contato da outra parte, valores, situação do pagamento e do repasse, confirmação do show e avaliação.

## Tecnologias (nova seção ou anexo)

| Camada | Tecnologia | Por quê |
|---|---|---|
| Aplicativo | React Native com Expo | Um único código para celular e navegador |
| API | Node.js, Hono, Zod | Regras de negócio testáveis e validação de entrada |
| Banco, login e arquivos | Supabase (PostgreSQL) | Autenticação pronta, regras de acesso por linha, tempo real |
| Pagamentos | Asaas (sandbox) | Pix, retenção e transferência por API |
| Testes | Vitest e pgTAP | Regras, API e banco testados de forma automática |

## Trabalhos futuros

- Split de pagamento com Conta Escrow da Asaas, o modelo regulado para produção.
- Plano Premium e prioridade no feed; penalidade (Shadowban) para cancelamentos tardios.
- Multa ao artista em caso de ausência, por cartão tokenizado.
- Validação de CPF/CNPJ junto à Receita Federal (KYC).
- Mediação de disputas e trilha de auditoria completa.
- Notificações com o aplicativo fechado (push) e publicação nas lojas.
- Filtro por público-alvo.

## 5 Considerações finais (complemento)

O projeto foi reduzido em relação à proposta inicial para entregar um fluxo completo e seguro: publicação do evento, inscrição com negociação, pagamento retido, confirmação do show, repasse e avaliação. As regras que a proposta original não definia, como o que acontece quando ninguém confirma o show, a desistência do músico e a negociação do valor, foram decididas pelo grupo e documentadas, o que torna o comportamento da plataforma previsível para as duas partes.

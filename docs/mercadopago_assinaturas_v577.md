# TAF DOS CAMPEÕES — Mercado Pago Assinaturas V5.7.7

## Situação
PR em rascunho. Integração ainda não publicada nem conectada a credenciais de Mercado Pago.
Checkout desativado por padrão, mesmo depois de implantar a Edge Function: MP_CHECKOUT_ENABLED deve ser explicitamente definido como true.

## 1. Modelo contratado
- ONLINE: R$ 99,90/mês.
- FULL: R$ 169,90/mês.
- Cobrança recorrente Mercado Pago via POST /preapproval com status=pending e init_point da página hospedada do Mercado Pago.
- O programa de indicações (10% na próxima mensalidade após cadastro do indicado) ainda NÃO foi conectado. Não cobrar desconto sem política validada no servidor.
- A disponibilidade de Pix ou outros meios recorrentes depende da conta do vendedor e da configuração Mercado Pago. Não prometer método sem confirmar no checkout.

## 2. Preparar Supabase
SQL: supabase/sql/mercadopago_assinaturas_v577.sql
Ele cria planos, assinaturas, pagamentos, registro de webhooks, políticas RLS e amplia a política de treinos para assinatura ativa com acesso_ate futuro.
IMPORTANTE: revisar em ambiente de teste e fazer backup antes de executar em produção; não reexecutar para sobrescrever preços sem verificar os registros.

## 3. Configurar Mercado Pago sem expor credenciais
Acesse: https://www.mercadopago.com.br/developers/
Crie aplicação para cobrança e configure os webhooks.
Guarde somente em Supabase > Edge Functions > Secrets:
- MP_ACCESS_TOKEN: token da API para sua aplicação (começar com credenciais de TESTE).
- MP_WEBHOOK_SECRET: assinatura secreta gerada no painel de Webhooks.
- MP_CHECKOUT_ENABLED: false inicialmente; true SOMENTE depois de testar em ambiente apropriado.
As variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são mantidas exclusivamente no servidor. Nunca coloque access token/service-role no index.html, GitHub, conversa, print ou documentação pública.

## 4. Criar funções
- supabase/functions/mp-iniciar-assinatura/index.ts — recebe o plano, autentica usuário, insere assinatura pendente, cria preapproval e retorna checkout_url validado.
- supabase/functions/mp-webhook/index.ts — verifica x-signature HMAC, recupera assinatura/fatura/pagamento na API e só concede acesso após pagamento realmente aprovado.
Para ambas as funções, se necessário, desative Verify JWT with legacy secret, porque uma usa auth.getUser(token) e a outra HMAC. Não dispense essas validações.

## 5. Configurar Webhook no painel Mercado Pago
URL: https://niuwscihdpflodhwwdqr.supabase.co/functions/v1/mp-webhook
Tópicos: subscription_preapproval, subscription_authorized_payment e payment.
Os webhooks devem incluir query data.id e os headers x-request-id e x-signature; falta destes é tratado como erro.
A função compara as referências e preços com a assinatura registrada no Supabase e busca os recursos na API do Mercado Pago. O retorno da página não ativa assinatura.

## 6. Corrigir assistir-video-taf antes de qualquer cobrança real
A função de produção V5.7.4.4 libera vídeo apenas com taf_acessos_teste. Para pagar e assistir, alterar sua validação de acesso para:
- conferir ownership: o usuário é dono do aluno do treino;
- liberar se existe teste ativo e válido OU assinatura com status ativa e acesso_ate > agora, sem falhas de consulta;
- validar treino publicado, vídeo aprovado, link do exercício, professor ativo/vinculado;
- retornar URL Storage assinada de 180 segundos.
Arquivo de referência de atualização está disponível para aplicação e teste; não basta mudar o HTML.

## 7. Fluxo manual PDF
O aluno recebe plano após status ativa no servidor e professor aprovar/publicar o treino. Botão Meu manual A4 já disponível no navegador.
GERAÇÃO AUTOMÁTICA DO PDF SERVER-SIDE após pagamento e aprovação é uma etapa separada ainda pendente; deve gravar arquivo em bucket privado e gerar URL assinada após autorização.

## 8. Testes obrigatórios antes do merge
1. Sem MP_CHECKOUT_ENABLED=true, o botão deve dar aviso e não criar cobrança.
2. Com usuário inválido, o backend deve negar checkout.
3. Com usuário de teste, checkout em sandbox retorna página Mercado Pago HTTPS.
4. Retornar à página sem pagar NÃO libera Área Premium.
5. Webhook sem assinatura ou HMAC inválido é rejeitado.
6. Webhook duplicado não duplica cobrança nem registro.
7. Assinatura apenas authorized, sem fatura aprovada: não libera acesso.
8. Fatura e pagamento aprovados com valor e referência corretos: assinatura ativa com acesso_ate.
9. Conta não autorizada não acessa treino/vídeo/PDF direto pela API.
10. Cancelamento, estorno, pausa e expiração revogam acesso conforme política comercial.
11. Confirmar autorização de vídeo também para cliente pago e manutenção do acesso temporário de teste.
12. Treinos IA permanecem rascunho até professor revisar e publicar.

## Referências oficiais (11/2026)
- https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments
- https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks
- https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/authorized-payment-search/get
- https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/get-authorized-payment/get
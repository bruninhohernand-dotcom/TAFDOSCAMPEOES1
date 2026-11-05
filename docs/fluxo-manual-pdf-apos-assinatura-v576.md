# TAF dos Campeões — Manual PDF após assinatura (V5.7.6)

## Fluxo definido para produção
1. Cadastro gratuito: avaliação, edital e diagnóstico inicial.
2. Aluno escolhe o plano Online ou Full. Pagamento é criado no servidor pelo gateway; o navegador nunca define status de assinatura.
3. Apenas webhook assinado/verificado do gateway pode confirmar pagamento e ativar assinatura. Idempotência é obrigatória.
4. IA prepara rascunho individual com edital, avaliação e limitações do aluno. Não comparar medidas incompatíveis e não supor técnicas desconhecidas.
5. Professor revisa e aprova treinos e orientações. Dor, lesão e restrições exigem avaliação humana, não liberação automática.
6. Manual aprovado reúne treinos_semanais, treino_sessoes, treino_exercicios e taf_guias_exercicios: cada exercício tem execução, erros, musculaturas, volume, descanso e vídeo de demonstração aprovado.
7. Um job seguro gera PDF A4 de uma versão do treino e grava em bucket privado do Supabase, com aluno_id, treino_id, versão e hash; preserve versões antigas.
8. O download é liberado após autenticação e autorização checada no servidor; gerar URL assinada de curta duração. Nunca use link público para documento pessoal.
9. Nova avaliação exige nova versão e nova aprovação, sem substituir conteúdo já liberado.

## Status real hoje
- Existentes: análise de edital, gerador IA de treino em rascunho, publicação após aprovação, fichas didáticas com edição do professor, checklist, vídeos vinculados, impressão A4 e acesso de teste.
- Esta PR V5.7.6: ativa o botão GERAR MANUAL PDF para mostrar impressão A4 da versão publicada aos usuários autorizados. Sem publicação, explica que o manual está em preparação.
- Não existentes: tabelas planos/assinaturas no Supabase de produção, checkout real, webhook assinado, job de PDF persistido, download por URL privada. Não anunciar a etapa automática como concluída.
- É necessário definir um gateway de pagamentos, como Mercado Pago ou Asaas, antes de implementar confirmação da assinatura.

## Critérios de aceite da automação
- Usuário não forja pagamento por JavaScript, localStorage ou requisição direta.
- Webhook é validado e idempotente, incluindo eventos repetidos/estorno/cancelamento.
- Sem assinatura válida, não há acesso direto a treinos premium ou PDFs privados.
- Pagamento confirmado não publica instruções técnicas sem professor.
- PDF contém apenas a versão do treino publicada e dicas revisadas.
- Acesso restrito ao aluno, professor vinculado e administração autorizada.
- Dados médicos e pessoais observam LGPD, consentimentos e tempo de retenção.

## Observação
O PDF atual usa a impressão do navegador e o aluno seleciona Salvar como PDF. A geração automática pós-pagamento ainda exige backend e integração de cobrança.
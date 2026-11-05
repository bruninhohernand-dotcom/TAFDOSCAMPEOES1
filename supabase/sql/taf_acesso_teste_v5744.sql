-- TAF dos Campeões: acesso temporário para testes (sem simular pagamento)
-- Execute no SQL Editor do Supabase como administrador do projeto.
-- A tabela não altera assinaturas, planos ou treinos existentes.
BEGIN;
CREATE TABLE IF NOT EXISTS public.taf_acessos_teste (
  aluno_id uuid PRIMARY KEY REFERENCES public.alunos(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT false,
  inicio_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL,
  motivo text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT taf_teste_periodo_valido CHECK (expira_em > inicio_em)
);
ALTER TABLE public.taf_acessos_teste ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS taf_teste_aluno_consulta_propria ON public.taf_acessos_teste;
CREATE POLICY taf_teste_aluno_consulta_propria ON public.taf_acessos_teste
 FOR SELECT TO authenticated
 USING (
   EXISTS (
     SELECT 1 FROM public.alunos a
     WHERE a.id = taf_acessos_teste.aluno_id AND a.user_id = (SELECT auth.uid())
   )
 );
REVOKE ALL ON public.taf_acessos_teste FROM anon;
REVOKE ALL ON public.taf_acessos_teste FROM authenticated;
GRANT SELECT ON public.taf_acessos_teste TO authenticated;
COMMIT;

-- Apenas após a tabela estar criada, autorize o ALUNO TESTE por sete dias:
-- Selecione e execute a instrução abaixo separadamente.
/*
INSERT INTO public.taf_acessos_teste(aluno_id, ativo, inicio_em, expira_em, motivo)
SELECT a.id, true, now(), now() + interval '7 days', 'Teste autorizado do treino e video'
FROM public.alunos a
JOIN public.perfis p ON p.id = a.user_id
WHERE upper(trim(p.nome)) = 'ALUNO TESTE' AND p.tipo = 'aluno'
ON CONFLICT (aluno_id) DO UPDATE SET
  ativo = EXCLUDED.ativo, inicio_em = EXCLUDED.inicio_em,
  expira_em = EXCLUDED.expira_em, motivo = EXCLUDED.motivo;
*/

-- Verifique a concessão:
SELECT aluno_id, ativo, inicio_em, expira_em
FROM public.taf_acessos_teste;

-- ATENÇÃO: interface não é camada de segurança.
-- Antes de liberar em produção, a Edge Function assistir-video-taf deve validar
-- autorização individual e vigência do acesso (ou assinatura ativa), além de
-- treino publicado, vínculo de vídeo e usuário autenticado. As policies de
-- treinos e links também precisam respeitar essa regra.
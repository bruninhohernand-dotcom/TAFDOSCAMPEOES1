-- TAF DOS CAMPEÕES • V5.7.5 • Fichas didáticas por exercício
-- Esta migração cria uma tabela opcional. Não altera treinos publicados.
-- Somente conteúdo original/autorizado deve ser publicado nas fichas.

BEGIN;
CREATE TABLE IF NOT EXISTS public.taf_guias_exercicios (
  exercicio_id uuid PRIMARY KEY
    REFERENCES public.treino_exercicios(id) ON DELETE CASCADE,
  posicao_inicial text,
  execucao text,
  musculos_alvo text,
  biomecanica text,
  erros_comuns text,
  dicas_professor text,
  ilustracao_url text,
  autor_user_id uuid REFERENCES auth.users(id),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT taf_guia_ilustracao_https CHECK (
    ilustracao_url IS NULL OR ilustracao_url = '' OR ilustracao_url ~ '^https://'
  )
);

ALTER TABLE public.taf_guias_exercicios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "taf_v575_guia_ler" ON public.taf_guias_exercicios;
CREATE POLICY "taf_v575_guia_ler" ON public.taf_guias_exercicios
 FOR SELECT TO authenticated USING (
   EXISTS (
     SELECT 1 FROM public.treino_exercicios e
     WHERE e.id = taf_guias_exercicios.exercicio_id
   )
 );

-- O editor precisa ser professor vinculado ao aluno ou administrador.
-- A função pode_ver_aluno_taf já valida o perfil profissional e o vínculo.
DROP POLICY IF EXISTS "taf_v575_guia_professor_criar" ON public.taf_guias_exercicios;
CREATE POLICY "taf_v575_guia_professor_criar" ON public.taf_guias_exercicios
 FOR INSERT TO authenticated WITH CHECK (
   EXISTS (
     SELECT 1
     FROM public.treino_exercicios e
     JOIN public.treinos_semanais t ON t.id = e.treino_id
     WHERE e.id = taf_guias_exercicios.exercicio_id
       AND public.pode_ver_aluno_taf(t.aluno_id)
   )
 );

DROP POLICY IF EXISTS "taf_v575_guia_professor_editar" ON public.taf_guias_exercicios;
CREATE POLICY "taf_v575_guia_professor_editar" ON public.taf_guias_exercicios
 FOR UPDATE TO authenticated
 USING (
   EXISTS (
     SELECT 1 FROM public.treino_exercicios e
     JOIN public.treinos_semanais t ON t.id = e.treino_id
     WHERE e.id = taf_guias_exercicios.exercicio_id
       AND public.pode_ver_aluno_taf(t.aluno_id)
   )
 )
 WITH CHECK (
   EXISTS (
     SELECT 1 FROM public.treino_exercicios e
     JOIN public.treinos_semanais t ON t.id = e.treino_id
     WHERE e.id = taf_guias_exercicios.exercicio_id
       AND public.pode_ver_aluno_taf(t.aluno_id)
   )
 );

REVOKE ALL ON public.taf_guias_exercicios FROM PUBLIC, anon;
REVOKE ALL ON public.taf_guias_exercicios FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.taf_guias_exercicios TO authenticated;
COMMIT;

-- Inspecionar RLS; a instalação não prova por si só o controle efetivo.
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='taf_guias_exercicios'
ORDER BY policyname;

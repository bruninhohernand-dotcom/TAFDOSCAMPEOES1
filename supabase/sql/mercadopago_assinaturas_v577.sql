-- TAF DOS CAMPEÕES • V5.7.7 • Mercado Pago Assinaturas
-- Modo de implantação: SEM credenciais e SEM ativação automática por status informado pelo cliente.
-- Antes de produção, auditar políticas existentes, conferir webhook e testar contas reais em sandbox.
BEGIN;

CREATE TABLE IF NOT EXISTS public.planos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE CHECK (nome IN ('ONLINE', 'FULL')),
  descricao text NOT NULL DEFAULT '',
  valor numeric(10,2) NOT NULL CHECK (valor > 0),
  ativo boolean NOT NULL DEFAULT true,
  presencial boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.planos(nome,descricao,valor,ativo,presencial) VALUES
  ('ONLINE','Acompanhamento remoto, treino semanal, vídeos e manual aprovado.',99.90,true,false),
  ('FULL','Plano Online e duas sessões presenciais por semana conforme turma.',169.90,true,true)
ON CONFLICT (nome) DO UPDATE SET
 descricao=EXCLUDED.descricao, valor=EXCLUDED.valor,
 presencial=EXCLUDED.presencial;

CREATE TABLE IF NOT EXISTS public.assinaturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  plano_id uuid NOT NULL REFERENCES public.planos(id),
  status text NOT NULL DEFAULT 'pendente'
    CHECK(status IN ('pendente','ativa','vencida','pausada','cancelada','estornada')),
  mp_preapproval_id text UNIQUE,
  external_reference text NOT NULL UNIQUE,
  checkout_url text,
  mp_status text,
  valor_base numeric(10,2) NOT NULL,
  desconto_percentual numeric(5,2) NOT NULL DEFAULT 0
    CHECK(desconto_percentual >= 0 AND desconto_percentual <= 100),
  valor_final numeric(10,2) NOT NULL,
  inicio_em timestamptz,
  proxima_cobranca timestamptz,
  acesso_ate timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS taf_mp_assinatura_aluno_idx
 ON public.assinaturas (aluno_id,criado_em DESC);
CREATE UNIQUE INDEX IF NOT EXISTS taf_mp_uma_assinatura_aberta
 ON public.assinaturas(aluno_id) WHERE status IN ('pendente','ativa');

CREATE TABLE IF NOT EXISTS public.pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assinatura_id uuid NOT NULL REFERENCES public.assinaturas(id) ON DELETE CASCADE,
  mp_payment_id text NOT NULL UNIQUE,
  mp_authorized_payment_id text,
  status text NOT NULL,
  valor numeric(10,2) NOT NULL,
  moeda text NOT NULL DEFAULT 'BRL',
  pago_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mp_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  recurso_id text NOT NULL,
  request_id text,
  status_processamento text NOT NULL DEFAULT 'recebido',
  erro_resumido text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tipo,recurso_id,request_id)
);

-- Visibilidade: planos ativos públicos, demais registros apenas do próprio assinante.
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS taf_mp_planos_publicos ON public.planos;
CREATE POLICY taf_mp_planos_publicos ON public.planos FOR SELECT TO anon,authenticated USING (ativo);

DROP POLICY IF EXISTS taf_mp_assinatura_propria ON public.assinaturas;
CREATE POLICY taf_mp_assinatura_propria ON public.assinaturas FOR SELECT TO authenticated
USING(EXISTS(
 SELECT 1 FROM public.alunos a WHERE a.id = assinaturas.aluno_id AND a.user_id = (SELECT auth.uid())
));

DROP POLICY IF EXISTS taf_mp_pagamento_proprio ON public.pagamentos;
CREATE POLICY taf_mp_pagamento_proprio ON public.pagamentos FOR SELECT TO authenticated
USING(EXISTS(
 SELECT 1 FROM public.assinaturas s
 JOIN public.alunos a ON a.id = s.aluno_id
 WHERE s.id = pagamentos.assinatura_id AND a.user_id = (SELECT auth.uid())
));

REVOKE ALL ON public.assinaturas FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.pagamentos FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.mp_eventos FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.assinaturas,public.pagamentos TO authenticated;
GRANT SELECT ON public.planos TO anon,authenticated;

-- Pagamento só dá acesso enquanto a assinatura estiver ativa com cobertura vigente.
-- O auth.uid() é comparado ao dono para que a função não conceda direitos sobre terceiros.
CREATE OR REPLACE FUNCTION public.tem_assinatura_ativa_taf(p_aluno_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
 SELECT EXISTS(
  SELECT 1
  FROM public.assinaturas s
  JOIN public.alunos a ON a.id=s.aluno_id
  WHERE s.aluno_id=p_aluno_id AND a.user_id=(SELECT auth.uid())
    AND s.status='ativa' AND s.acesso_ate > now()
 );
$$;
REVOKE ALL ON FUNCTION public.tem_assinatura_ativa_taf(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tem_assinatura_ativa_taf(uuid) TO authenticated;

-- Não prejudicar o acesso do professor ou o acesso temporário já configurado.
ALTER POLICY "treinos aluno publicados" ON public.treinos_semanais
TO authenticated
USING(
 public.pode_ver_aluno_taf(aluno_id)
 OR (
  status IN ('publicado','concluido')
  AND EXISTS(
   SELECT 1 FROM public.alunos a
   WHERE a.id=treinos_semanais.aluno_id AND a.user_id=(SELECT auth.uid())
  )
  AND (
   EXISTS(
    SELECT 1 FROM public.taf_acessos_teste t
    WHERE t.aluno_id=treinos_semanais.aluno_id AND t.ativo=true
      AND t.inicio_em<=now() AND t.expira_em>now()
   )
   OR public.tem_assinatura_ativa_taf(aluno_id)
  )
 )
);
COMMIT;

-- Confirmação estrutural (não substitui testes de autorização)
SELECT to_regclass('public.planos') AS planos,
       to_regclass('public.assinaturas') AS assinaturas,
       to_regclass('public.pagamentos') AS pagamentos,
       (SELECT count(*) FROM public.planos WHERE ativo) AS planos_ativos;

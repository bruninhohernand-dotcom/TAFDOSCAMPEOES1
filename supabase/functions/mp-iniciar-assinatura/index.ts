// Edge Function: mp-iniciar-assinatura
// Cliente autenticado -> proposta pendente no banco -> checkout hospedado Mercado Pago.
// Secret MP_ACCESS_TOKEN NUNCA aparece no HTML. MP_CHECKOUT_ENABLED precisa ser "true".
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigin = "https://bruninhohernand-dotcom.github.io";
const returnUrl = allowedOrigin + "/TAFDOSCAMPEOES1/";
const cors = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
function reply(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store" },
  });
}
function checkoutUrlAllowed(input: unknown) {
  try {
    const u = new URL(String(input));
    return u.protocol === "https:" &&
      /(^|\.)mercadopago\.com(\.br)?$/.test(u.hostname);
  } catch { return false; }
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply({ error: "Método inválido" }, 405);
  if (req.headers.get("origin") !== allowedOrigin)
    return reply({ error: "Origem não autorizada" }, 403);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return reply({ error: "Faça login primeiro." }, 401);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const mpToken = Deno.env.get("MP_ACCESS_TOKEN") || "";
  if (!url || !service) return reply({ error: "Supabase não configurado" }, 503);
  // Sem credenciais ou liberação manual, NÃO gerar nenhum pagamento real.
  if (!mpToken || Deno.env.get("MP_CHECKOUT_ENABLED") !== "true")
    return reply({ error: "Cobrança Mercado Pago em configuração. Nenhum pagamento foi criado." }, 503);
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const { data: identity, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !identity?.user?.email) return reply({ error: "Sessão inválida." }, 401);
    const user = identity.user;
    const requestBody = await req.json().catch(() => null);
    const nome = String(requestBody?.plano || "").toUpperCase();
    if (!["ONLINE", "FULL"].includes(nome))
      return reply({ error: "Plano inválido." }, 400);
    const [{ data: aluno, error: alunoErr }, { data: plano, error: planoErr }] = await Promise.all([
      admin.from("alunos").select("id").eq("user_id", user.id).maybeSingle(),
      admin.from("planos").select("id,nome,valor,ativo").eq("nome", nome).eq("ativo", true).maybeSingle(),
    ]);
    if (alunoErr || !aluno) return reply({ error: "Conclua seu cadastro de aluno antes de assinar." }, 409);
    if (planoErr || !plano) return reply({ error: "Plano temporariamente indisponível." }, 409);
    const { data: aberta, error: abertaErr } = await admin.from("assinaturas")
      .select("id,status,checkout_url").eq("aluno_id", aluno.id)
      .in("status", ["pendente", "ativa"]).order("criado_em", { ascending: false })
      .limit(1).maybeSingle();
    if (abertaErr) throw abertaErr;
    if (aberta?.status === "ativa") return reply({ error: "Você já possui uma assinatura ativa." }, 409);
    if (aberta?.status === "pendente") {
      if (checkoutUrlAllowed(aberta.checkout_url))
        return reply({ checkout_url: aberta.checkout_url, status: "pendente" });
      return reply({ error: "Existe uma solicitação pendente. Verifique no suporte antes de criar outra." }, 409);
    }

    const id = crypto.randomUUID();
    const amount = Number(plano.valor);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Preço inválido no banco");
    const { error: insertErr } = await admin.from("assinaturas").insert({
      id, external_reference: id, aluno_id: aluno.id, plano_id: plano.id,
      status: "pendente", valor_base: amount, valor_final: amount, desconto_percentual: 0,
    });
    if (insertErr) {
      // A constraint de assinatura em aberto impede cliques duplicados de criarem cobranças múltiplas.
      return reply({ error: "Já existe uma solicitação de assinatura em andamento. Atualize a página." }, 409);
    }
    const mpResp = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + mpToken,
        "Content-Type": "application/json",
        "X-Idempotency-Key": id,
      },
      body: JSON.stringify({
        reason: "TAF dos Campeões - " + nome,
        external_reference: id,
        payer_email: user.email,
        auto_recurring: {
          frequency: 1, frequency_type: "months", transaction_amount: amount, currency_id: "BRL",
        },
        back_url: returnUrl,
        status: "pending",
      }),
    });
    const mpData = await mpResp.json().catch(() => ({}));
    if (!mpResp.ok) {
      await admin.from("assinaturas").update({ status: "cancelada" }).eq("id", id);
      console.error("Mercado Pago erro ao criar checkout", mpResp.status);
      return reply({ error: "Não foi possível iniciar a assinatura no Mercado Pago." }, 502);
    }
    const update = {
      mp_preapproval_id: String(mpData.id || ""),
      mp_status: String(mpData.status || "pending"),
      checkout_url: checkoutUrlAllowed(mpData.init_point) ? String(mpData.init_point) : null,
    };
    const { error: saveErr } = await admin.from("assinaturas").update(update).eq("id", id);
    if (saveErr) throw saveErr;
    if (!update.mp_preapproval_id || !update.checkout_url)
      return reply({ error: "Assinatura criada, mas o checkout não foi retornado. Contate o suporte." }, 502);
    return reply({ checkout_url: update.checkout_url, status: "pendente", plano: nome });
  } catch (err) {
    console.error("mp-iniciar-assinatura", err);
    return reply({ error: "Não foi possível iniciar o pagamento. Tente novamente pelo suporte." }, 500);
  }
});

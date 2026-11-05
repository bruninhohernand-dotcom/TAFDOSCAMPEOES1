// TAF DOS CAMPEÕES • Mercado Pago Assinaturas
// Recebe webhooks assinados; consulta a API MP para confirmar assinatura E pagamento.
// JWT LEGACY do gateway: OFF (MP não tem JWT Supabase). Assinatura x-signature é obrigatória.
// Segredos: MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";
const textEncoder = new TextEncoder();
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store" },
  });
}
function hexToBytes(hex: string): Uint8Array {
  if (!/^[\da-f]{64}$/i.test(hex)) return new Uint8Array();
  return new Uint8Array(hex.match(/../g)!.map(v => parseInt(v,16)));
}
function constantTimeEqual(a: Uint8Array,b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
async function verifySignature(req: Request,url: URL,secret: string) {
  const signature=req.headers.get("x-signature")||"";
  const requestId=req.headers.get("x-request-id")||"";
  const id=url.searchParams.get("data.id")||url.searchParams.get("data_id")||"";
  const pairs=Object.fromEntries(signature.split(",").map(p=>p.trim().split("=",2)));
  const ts=String(pairs.ts||"");const hash=String(pairs.v1||"");
  if(!id||!requestId||!ts||!hash||!/^[0-9]+$/.test(ts))return null;
  // Aceitar carimbo em segundos ou milissegundos; rejeitar replay fora de 5 minutos.
  const time=Number(ts);const millis=ts.length>=13?time:time*1000;
  if(!Number.isFinite(millis)||Math.abs(Date.now()-millis)>300000)return null;
  const manifest="id:"+id+";request-id:"+requestId+";ts:"+ts+";";
  const key=await crypto.subtle.importKey("raw",textEncoder.encode(secret),
    {name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signed=new Uint8Array(await crypto.subtle.sign("HMAC",key,textEncoder.encode(manifest)));
  return constantTimeEqual(signed,hexToBytes(hash))?{id,requestId}:null;
}
type MpInvoice = Record<string, any>;
async function getMP<T=Record<string,any>>(url:string,token:string):Promise<T>{
  const res=await fetch(url,{headers:{Authorization:"Bearer "+token,Accept:"application/json"}});
  if(!res.ok)throw new Error("Mercado Pago GET "+res.status);
  return await res.json() as T;
}
const isSameNumber=(a:unknown,b:unknown)=>Math.abs(Number(a)-Number(b))<0.011;
Deno.serve(async (req)=>{
  if(req.method!=="POST")return json({error:"method"},405);
  const signingSecret=Deno.env.get("MP_WEBHOOK_SECRET")||"";
  const token=Deno.env.get("MP_ACCESS_TOKEN")||"";
  const url=Deno.env.get("SUPABASE_URL")||"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!signingSecret||!token||!url||!service)return json({error:"not configured"},503);
  const endpoint=new URL(req.url);
  const verified=await verifySignature(req,endpoint,signingSecret);
  if(!verified)return json({error:"invalid signature"},401);
  const payload=await req.json().catch(()=>null);
  // Nunca confiar em nome/ID do payload sem reconciliar com a API MP.
  if(!payload || String(payload.data?.id||"")!==verified.id)
    return json({error:"resource mismatch"},400);
  const type=String(payload.type||"");
  if(!["subscription_preapproval","subscription_authorized_payment","payment"].includes(type)){
    return json({ok:true,ignored:true});
  }
  const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
  const event={tipo:type,recurso_id:verified.id,request_id:verified.requestId,
    status_processamento:"recebido"};
  const {data:existing}=await admin.from("mp_eventos").select("id,status_processamento")
    .eq("tipo",type).eq("recurso_id",verified.id).eq("request_id",verified.requestId).maybeSingle();
  if(existing?.status_processamento==="processado")return json({ok:true,duplicate:true});
  let eventId=existing?.id;
  if(!eventId){
    const {data:created,error:evtErr}=await admin.from("mp_eventos")
      .insert(event).select("id").single();
    if(evtErr && evtErr.code!=="23505")return json({error:"event store failure"},500);
    eventId=created?.id;
  }
  const mark=async (status:string,reason?:string)=>{
    if(eventId)await admin.from("mp_eventos")
      .update({status_processamento:status,erro_resumido:reason?.slice(0,180)||null}).eq("id",eventId);
  };
  try{
    let subscriptionId="";
    if(type==="subscription_preapproval") subscriptionId=verified.id;
    if(type==="subscription_authorized_payment"){
      const invoice=await getMP<MpInvoice>(
        "https://api.mercadopago.com/authorized_payments/"+encodeURIComponent(verified.id),token);
      subscriptionId=String(invoice.preapproval_id||"");
    }
    if(type==="payment"){
      const params=new URLSearchParams({payment_id:verified.id,limit:"10"});
      const result=await getMP<{results?:MpInvoice[]}>(
        "https://api.mercadopago.com/authorized_payments/search?"+params.toString(),token);
      subscriptionId=String(result.results?.find(inv=>String(inv.payment?.id||"")===verified.id)?.preapproval_id||"");
      if(!subscriptionId){await mark("ignorado","Pagamento não relacionado a assinatura");return json({ok:true,ignored:true});}
    }
    if(!subscriptionId)throw new Error("Missing subscription reference");
    const mpSubscription=await getMP(
      "https://api.mercadopago.com/preapproval/"+encodeURIComponent(subscriptionId),token);
    const ref=String(mpSubscription.external_reference||"");
    const {data:ass,error:assError}=await admin.from("assinaturas").select(
      "id,aluno_id,mp_preapproval_id,valor_final,status"
    ).eq("external_reference",ref).maybeSingle();
    if(assError)throw assError;
    if(!ass||ass.mp_preapproval_id && ass.mp_preapproval_id!==subscriptionId){
      await mark("ignorado","Assinatura MP sem referência local");
      return json({ok:true,ignored:true});
    }
    const expected=Number(ass.valor_final);
    if(String(mpSubscription.id)!==subscriptionId||
      String(mpSubscription.auto_recurring?.currency_id)!=="BRL"||
      !isSameNumber(mpSubscription.auto_recurring?.transaction_amount,expected)){
      throw new Error("Subscription plan mismatch");
    }
    const rawStatus=String(mpSubscription.status||"");
    if(rawStatus==="canceled"||rawStatus==="paused"){
      const {error}=await admin.from("assinaturas").update({
        status:rawStatus==="canceled"?"cancelada":"pausada",
        mp_preapproval_id:subscriptionId,mp_status:rawStatus,
        acesso_ate:null,proxima_cobranca:null,atualizado_em:new Date().toISOString(),
      }).eq("id",ass.id);
      if(error)throw error;
      await mark("processado");return json({ok:true,status:rawStatus});
    }

    // Plano cobrado mensalmente: somente fatura com pagamento aprovado
    // e recurso de pagamento confirmado pela API (não somente assinatura authorized).
    const invoices=await getMP<{results?:MpInvoice[]}>(
      "https://api.mercadopago.com/authorized_payments/search?"+
      new URLSearchParams({preapproval_id:subscriptionId,limit:"30"}),token);
    const matched=(invoices.results||[])
      .filter(inv=>String(inv.preapproval_id)===subscriptionId)
      .sort((a,b)=>Date.parse(String(b.debit_date||b.date_created||""))-
                   Date.parse(String(a.debit_date||a.date_created||"")));
    let activeUntil:string|null=null;
    let chosenPayment:string|null=null;
    for(const inv of matched){
      const pid=String(inv.payment?.id||"");
      if(!pid||inv.payment?.status!=="approved"||
         String(inv.currency_id)!=="BRL"||
         !isSameNumber(inv.transaction_amount,expected))continue;
      const payment=await getMP(
        "https://api.mercadopago.com/v1/payments/"+encodeURIComponent(pid),token);
      const paymentDate=Date.parse(String(payment.date_approved||""));
      if(payment.status!=="approved" || payment.currency_id!=="BRL" ||
          !isSameNumber(payment.transaction_amount,expected) ||
          !Number.isFinite(paymentDate))continue;
      // O pagamento mais recente cobre até 32 dias após sua aprovação.
      // Para vencimentos/renovações: webhook atualiza com novo pagamento confirmado.
      const expires=new Date(paymentDate+32*24*3600*1000);
      if(expires.getTime()>Date.now()){
        activeUntil=expires.toISOString();
        chosenPayment=pid;
        const {error:payErr}=await admin.from("pagamentos").upsert({
          assinatura_id:ass.id,mp_payment_id:pid,
          mp_authorized_payment_id:String(inv.id||""),
          status:"aprovado",valor:expected,moeda:"BRL",
          pago_em:new Date(paymentDate).toISOString(),
          atualizado_em:new Date().toISOString(),
        },{onConflict:"mp_payment_id"});
        if(payErr)throw payErr;
        break;
      }
    }
    const newStatus=activeUntil && rawStatus==="authorized"?"ativa":
       (ass.status==="ativa"?"vencida":"pendente");
    const {error:updateErr}=await admin.from("assinaturas").update({
      mp_preapproval_id:subscriptionId,
      mp_status:rawStatus,
      status:newStatus,
      acesso_ate:newStatus==="ativa"?activeUntil:null,
      proxima_cobranca:mpSubscription.next_payment_date||null,
      inicio_em:chosenPayment?new Date().toISOString():null,
      atualizado_em:new Date().toISOString(),
    }).eq("id",ass.id);
    if(updateErr)throw updateErr;
    await mark("processado");
    return json({ok:true,status:newStatus});
  }catch(err){
    console.error("mp-webhook: falha ao reconciliar",err);
    await mark("erro",err instanceof Error?err.message:"erro");
    return json({error:"processing failed"},500);
  }
});

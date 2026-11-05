// TAF dos Campeões V5.7.7 — vídeo privado para acesso pago ou teste temporário.
// Adaptado da V5.7.4.4 em uso: continua protegendo treino, exercício, vínculo e professor.
import { createClient } from 'npm:@supabase/supabase-js@2';
const BUCKET='videos-professores-taf';
const CORS={
 'Access-Control-Allow-Origin':'https://bruninhohernand-dotcom.github.io',
 'Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type',
 'Access-Control-Allow-Methods':'POST,OPTIONS',
 'Vary':'Origin',
};
function reply(body:unknown,status=200){
 return new Response(JSON.stringify(body),{
  status,headers:{...CORS,'Content-Type':'application/json','Cache-Control':'no-store'}
 });
}
function secretKey(){
 const old=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(old)return old;
 try{return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||''}
 catch{return ''}
}
function publicKey(){
 const old=Deno.env.get('SUPABASE_ANON_KEY');
 if(old)return old;
 try{return JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default||''}
 catch{return ''}
}
const uuid=(s:unknown)=>typeof s==='string'&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
 if(req.method!=='POST')return reply({ok:false,error:'Método não permitido.'},405);
 const token=(req.headers.get('Authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1];
 if(!token)return reply({ok:false,error:'Faça login para assistir.'},401);
 const url=Deno.env.get('SUPABASE_URL')||'';
 const key=publicKey(),secret=secretKey();
 if(!url||!key||!secret)return reply({ok:false,error:'Configuração do servidor incompleta.'},500);
 try{
  const userClient=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:identity,error:authError}=await userClient.auth.getUser(token);
  const user=identity?.user;
  if(authError||!user)return reply({ok:false,error:'Sessão inválida.'},401);
  const payload=await req.json().catch(()=>({}));
  const exerciseId=payload?.exercicio_id;
  if(!uuid(exerciseId))return reply({ok:false,error:'Exercício inválido.'},400);
  // A chave administrativa não é enviada ao navegador e contorna RLS:
  // cada permissão deve ser verificada explicitamente neste serviço.
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:e,error:eErr}=await admin.from('treino_exercicios')
   .select('id,treino_id').eq('id',exerciseId).maybeSingle();
  if(eErr||!e)return reply({ok:false,error:'Exercício indisponível.'},404);
  const {data:t}=await admin.from('treinos_semanais')
   .select('id,aluno_id,status').eq('id',e.treino_id).maybeSingle();
  if(!t||!['publicado','concluido'].includes(t.status))
   return reply({ok:false,error:'Treino não publicado.'},403);
  const {data:a}=await admin.from('alunos')
   .select('user_id').eq('id',t.aluno_id).maybeSingle();
  if(!a||a.user_id!==user.id)return reply({ok:false,error:'Vídeo não autorizado.'},403);

  // Falhar fechado se qualquer consulta de autorização produzir erro.
  const now=new Date().toISOString();
  const [{data:trial,error:trialError},{data:subscription,error:subError}]=await Promise.all([
   admin.from('taf_acessos_teste').select('aluno_id')
    .eq('aluno_id',t.aluno_id).eq('ativo',true)
    .lte('inicio_em',now).gt('expira_em',now).limit(1).maybeSingle(),
   admin.from('assinaturas').select('id')
    .eq('aluno_id',t.aluno_id).eq('status','ativa')
    .gt('acesso_ate',now).limit(1).maybeSingle(),
  ]);
  if(trialError||subError){
   console.error('assistir-video-taf: falha autorização',trialError?.message||subError?.message);
   return reply({ok:false,error:'Não foi possível confirmar sua autorização.'},503);
  }
  if(!trial&&!subscription)
   return reply({ok:false,error:'Seu acesso ao treino está inativo.'},403);

  const {data:link}=await admin.from('taf_video_exercicio_links')
   .select('video_id').eq('exercicio_id',exerciseId).maybeSingle();
  if(!link)return reply({ok:false,error:'Exercício sem vídeo associado.'},404);
  const {data:video}=await admin.from('taf_biblioteca_videos')
   .select('id,autor_user_id,titulo,orientacoes,caminho_storage,aprovado')
   .eq('id',link.video_id).maybeSingle();
  if(!video?.aprovado||!video.caminho_storage)
   return reply({ok:false,error:'Demonstração indisponível.'},403);
  const {data:prof}=await admin.from('professores')
   .select('id,ativo').eq('user_id',video.autor_user_id).maybeSingle();
  const {data:role}=await admin.from('perfis')
   .select('tipo').eq('id',video.autor_user_id).maybeSingle();
  if(role?.tipo!=='admin'){
   if(role?.tipo!=='treinador'||!prof?.ativo)
    return reply({ok:false,error:'Professor inativo.'},403);
   const {data:assigned}=await admin.from('professor_aluno').select('id')
    .eq('professor_id',prof.id).eq('aluno_id',t.aluno_id)
    .eq('ativo',true).maybeSingle();
   if(!assigned)return reply({ok:false,error:'Professor não vinculado.'},403);
  }
  const {data:signed,error:signError}=await admin.storage.from(BUCKET)
   .createSignedUrl(video.caminho_storage,180);
  if(signError||!signed?.signedUrl)
   return reply({ok:false,error:'Não foi possível abrir a gravação.'},500);
  return reply({ok:true,url:signed.signedUrl,titulo:video.titulo,
   orientacoes:video.orientacoes||'',validade_segundos:180});
 }catch(e){
  console.error('assistir-video-taf',e);
  return reply({ok:false,error:'Erro ao abrir demonstração.'},500);
 }
});

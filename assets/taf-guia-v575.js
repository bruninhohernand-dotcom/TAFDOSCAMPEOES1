/* TAF DOS CAMPEÕES • V5.7.5
 * Fichas didáticas originais por exercício, preenchidas pelo professor.
 * Não reutiliza textos, ilustrações ou vídeos de manuais de terceiros.
 */
const tafGuiaCacheV575 = new Map();
const tafGuiaCamposV575 = [
 ['posicao_inicial','Posição inicial'],
 ['execucao','Movimento / execução'],
 ['musculos_alvo','Musculaturas envolvidas'],
 ['biomecanica','Movimentos / mecânica'],
 ['erros_comuns','Erros comuns'],
 ['dicas_professor','Dicas do professor']
];
function tafGuiaEscapeV575(value){
 return String(value??'').replace(/[&<>"']/g,function(ch){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
 });
}
function tafGuiaUrlV575(value){
 try {const url=new URL(String(value||'').trim());return url.protocol==='https:'?url.href:''}catch{return ''}
}
function tafGuiaTextoV575(value,fallback){
 const text=String(value||'').trim();
 return tafGuiaEscapeV575(text||fallback||'');
}
async function tafGuiaCarregar(exercicios){
 tafGuiaCacheV575.clear();
 const ids=(exercicios||[]).map(function(e){return e.id}).filter(Boolean);
 if(!ids.length)return;
 try{
  const {data,error}=await sb.from('taf_guias_exercicios')
   .select('exercicio_id,posicao_inicial,execucao,musculos_alvo,biomecanica,erros_comuns,dicas_professor,ilustracao_url')
   .in('exercicio_id',ids);
  if(error)throw error;
  for(const item of data||[])tafGuiaCacheV575.set(item.exercicio_id,item);
 }catch(error){
  console.info('Fichas didáticas opcionais: execute a migração V5.7.5 para habilitar edição.',error.message||error);
 }
}
function tafGuiaAlunoHtml(exercicio,videoVinculado){
 const guia=tafGuiaCacheV575.get(exercicio.id)||{};
 const temConteudo=tafGuiaCamposV575.some(function(item){return !!String(guia[item[0]]||'').trim()})||!!tafGuiaUrlV575(guia.ilustracao_url);
 let campos='';
 for(const item of tafGuiaCamposV575){
  const valor=String(guia[item[0]]||'').trim();
  if(!valor)continue;
  campos+='<section class="tafGuidePanel'+(item[0]==='erros_comuns'?' important':'')+'"><h6>'+tafGuiaEscapeV575(item[1])+'</h6><p>'+tafGuiaEscapeV575(valor)+'</p></section>';
 }
 if(!campos)campos='<div class="tafGuidePending">O professor ainda não cadastrou orientações complementares nesta ficha. Siga a prescrição exibida acima e peça esclarecimentos antes de executar um movimento que você não conhece.</div>';
 const imagem=tafGuiaUrlV575(guia.ilustracao_url);
 const figura=imagem
  ? '<img loading="lazy" src="'+tafGuiaEscapeV575(imagem)+'" alt="Ilustração do exercício '+tafGuiaEscapeV575(exercicio.nome_exercicio)+' fornecida pelo professor">'
  : '<div class="tafGuideFigureIcon" aria-hidden="true">TC</div><span>Demonstração visual autoral do professor, quando cadastrada</span>';
 const verVideo=videoVinculado?'<button type="button" class="btn gold v574Small" onclick="openV574Video(\''+v574Id(exercicio.id)+'\')">▶ Assistir demonstração</button>':'<span class="v574NoVideo">Vídeo não vinculado a este exercício</span>';
 return '<details class="tafGuideDetails"><summary><span>📖 FICHA DE EXECUÇÃO'+
  '<span class="tafGuideSub">'+(temConteudo?'Posição, movimento, musculatura e correções':'Acompanhe a orientação existente; ficha complementar em preparação')+'</span></span></summary>'+
  '<div class="tafGuideMain"><div class="tafGuideHero">'+
  '<div class="tafGuideIntro"><span class="tafGuideEyebrow">TAF DOS CAMPEÕES • GUIA DO EXERCÍCIO</span>'+
  '<strong>'+tafGuiaEscapeV575(exercicio.nome_exercicio)+'</strong>'+
  '<p>'+tafGuiaTextoV575(exercicio.orientacao,'Siga a execução indicada pelo professor e respeite suas limitações.')+'</p>'+verVideo+'</div>'+
  '<div class="tafGuideFigure">'+figura+'</div></div>'+
  '<div class="tafGuideGrid">'+campos+'</div></div></details>';
}
function tafGuiaEditorMontar(){
 let dlg=document.querySelector('#tafGuiaEditor');
 if(dlg)return dlg;
 dlg=document.createElement('dialog');
 dlg.id='tafGuiaEditor';
 dlg.className='v574Modal';
 dlg.setAttribute('aria-labelledby','tafGuiaEditorTitle');
 const desc=tafGuiaCamposV575.map(function(campo){
  return '<div><label for="tafGuia_'+campo[0]+'">'+tafGuiaEscapeV575(campo[1])+'</label>'+
   '<textarea id="tafGuia_'+campo[0]+'" maxlength="1600" rows="3" placeholder="Escreva instruções originais e revisadas pelo professor"></textarea></div>';
 }).join('');
 dlg.innerHTML='<div class="eyebrow">FICHA DIDÁTICA • V5.7.5</div>'+
  '<h3 id="tafGuiaEditorTitle">Orientação do exercício</h3>'+
  '<p>Descreva o exercício com a linguagem do TAF dos Campeões. O aluno verá esta ficha somente no treino ao qual tem acesso.</p>'+
  '<div class="tafGuideEditorHelp">Use orientações próprias, verificadas e adequadas ao edital. Não copie textos, imagens ou vídeos do manual de referência sem autorização. Para ilustrações, informe apenas uma URL HTTPS pública de conteúdo do projeto; não use imagens de alunos sem consentimento.</div>'+
  '<div class="tafGuideForm" style="margin-top:14px">'+desc+
  '<div class="tafWide"><label for="tafGuia_ilustracao_url">Ilustração original (HTTPS, opcional)</label><input id="tafGuia_ilustracao_url" type="url" maxlength="1000" placeholder="https://.../imagem-autorizada.png"></div></div>'+
  '<div class="actions"><button type="button" class="btn" id="tafGuiaCancel">Cancelar</button>'+
  '<button type="button" class="btn gold" id="tafGuiaSave">Salvar ficha técnica</button></div>';
 document.body.appendChild(dlg);
 dlg.querySelector('#tafGuiaCancel').addEventListener('click',function(){dlg.close()});
 dlg.querySelector('#tafGuiaSave').addEventListener('click',tafGuiaSalvar);
 return dlg;
}
async function tafGuiaEditar(exercicioId,treinoId){
 if(!session||!isStaff()||!adminAllowedAlunoIds.length)return toast('Acesso do professor necessário.');
 try{
  const [e,t]=await Promise.all([
   sb.from('treino_exercicios').select('id,nome_exercicio,treino_id').eq('id',exercicioId).maybeSingle(),
   sb.from('treinos_semanais').select('id,aluno_id').eq('id',treinoId).maybeSingle()
  ]);
  if(e.error||t.error||!e.data||!t.data||e.data.treino_id!==t.data.id||!adminAllowedAlunoIds.includes(t.data.aluno_id))
   throw new Error('Treino fora da sua carteira de alunos.');
  const {data:guia,error}=await sb.from('taf_guias_exercicios').select('*').eq('exercicio_id',exercicioId).maybeSingle();
  if(error)throw error;
  const dlg=tafGuiaEditorMontar();
  dlg.dataset.exercicioId=exercicioId;
  dlg.dataset.treinoId=treinoId;
  dlg.querySelector('#tafGuiaEditorTitle').textContent=e.data.nome_exercicio;
  for(const campo of tafGuiaCamposV575){
   dlg.querySelector('#tafGuia_'+campo[0]).value=guia?.[campo[0]]||'';
  }
  dlg.querySelector('#tafGuia_ilustracao_url').value=guia?.ilustracao_url||'';
  dlg.showModal();
 }catch(err){console.error('Ficha didática',err);toast('Ficha técnica indisponível: '+(err.message||err))}
}
async function tafGuiaSalvar(){
 const dlg=document.querySelector('#tafGuiaEditor');
 if(!dlg||!dlg.open||!session||!isStaff())return;
 const id=dlg.dataset.exercicioId;
 const row={exercicio_id:id,autor_user_id:session.user.id,atualizado_em:new Date().toISOString()};
 for(const campo of tafGuiaCamposV575){
  row[campo[0]]=dlg.querySelector('#tafGuia_'+campo[0]).value.trim()||null;
 }
 const url=dlg.querySelector('#tafGuia_ilustracao_url').value.trim();
 if(url&&!tafGuiaUrlV575(url))return toast('A ilustração deve ter URL HTTPS válida.');
 row.ilustracao_url=url||null;
 const salvar=dlg.querySelector('#tafGuiaSave');
 salvar.disabled=true;salvar.textContent='Salvando…';
 try{
  const {error}=await sb.from('taf_guias_exercicios').upsert(row,{onConflict:'exercicio_id'});
  if(error)throw error;
  tafGuiaCacheV575.set(id,row);
  dlg.close();toast('Ficha didática salva! O aluno verá as orientações quando abrir o treino.');
  if(v574?.exercicios?.some(function(e){return e.id===id}))renderV574Week();
 }catch(err){console.error(err);toast('Não foi possível salvar a ficha: '+(err.message||err))}
 finally{salvar.disabled=false;salvar.textContent='Salvar ficha técnica'}
}
function tafGuiaImprimir(){
 if(!session||appRole!=='aluno'||!hasTrainingAccess()||!v574?.treino||!v574?.exercicios?.length){
  return toast('Abra seu treino publicado antes de gerar o PDF.');
 }
 const treino=v574.treino;
 let paginas='';
 for(const sessao of v574.sessoes){
  const exercicios=v574.exercicios.filter(function(e){return e.sessao_id===sessao.id});
  for(const e of exercicios){
   const g=tafGuiaCacheV575.get(e.id)||{};
   const img=tafGuiaUrlV575(g.ilustracao_url);
   const arte=img?'<img src="'+tafGuiaEscapeV575(img)+'" alt="Ilustração original de '+tafGuiaEscapeV575(e.nome_exercicio)+'">':
    '<div class="tafPdfNoImage">Demonstração em vídeo disponível na Área do Aluno, quando vinculada</div>';
   const parametros=[
    ['Séries',e.series],['Repetições',e.repeticoes],['Carga',e.carga],
    ['Tempo',e.tempo],['Descanso',e.descanso],['Distância',e.distancia],
    ['Ritmo / pace',e.pace_alvo],['Esforço alvo',e.rpe_alvo]
   ].filter(function(x){return x[1]!=null && String(x[1]).trim()!==''}).map(function(x){
    return '<b>'+tafGuiaEscapeV575(x[0])+':</b> '+tafGuiaEscapeV575(x[1]);
   }).join(' &nbsp; • &nbsp; ');
   let paineis='';
   for(const campo of tafGuiaCamposV575){
    const val=String(g[campo[0]]||'').trim();
    if(!val)continue;
    paineis+='<section class="tafPdfPanel"><h3>'+tafGuiaEscapeV575(campo[1])+'</h3><p>'+tafGuiaEscapeV575(val)+'</p></section>';
   }
   if(!paineis)paineis='<section class="tafPdfPanel"><h3>Orientações complementares</h3><p>A ficha detalhada ainda não foi cadastrada pelo professor. Consulte o profissional antes de executar exercícios desconhecidos.</p></section>';
   const anotacao=v574.execucoes.get(e.id);
   const situacao=anotacao?.status||'pendente';
   paginas+='<section class="tafPdfPage">'+
     '<header class="tafPdfTop"><div class="tafPdfBrand">TAF DOS CAMPEÕES • SEU GUIA DE TREINO</div>'+
     '<div class="tafPdfTitle">'+tafGuiaEscapeV575(e.nome_exercicio)+'</div>'+
     '<div class="tafPdfMeta">'+tafGuiaEscapeV575(sessao.dia_semana||'')+
     ' • '+tafGuiaEscapeV575(sessao.titulo||'Sessão')+
     ' • '+tafGuiaEscapeV575(treino.titulo||'Plano individual')+
     ' • Versão '+tafGuiaEscapeV575(treino.versao||'1')+'</div></header>'+
     '<div class="tafPdfVisual"><div><b>Orientação principal</b><p>'+tafGuiaTextoV575(e.orientacao,'Siga a orientação individual do professor.')+'</p></div>'+
      '<div>'+arte+'</div></div>'+
     '<div class="tafPdfStats">'+parametros+'</div>'+
     '<div class="tafPdfGrid">'+paineis+'</div>'+
     '<div class="tafPdfFields"><span>Registro: '+tafGuiaEscapeV575(situacao)+'</span>'+
     '<span>Observação do aluno: __________________________________</span></div>'+
     '<footer class="tafPdfFooter">Conteúdo individual do TAF dos Campeões. O professor deve validar a técnica, o edital e as adaptações. A ficha não substitui avaliação médica quando indicada. Vídeos privados são reproduzidos apenas após login.</footer>'+
     '</section>';
  }
 }
 if(!paginas)return toast('Ainda não existem exercícios para imprimir.');
 const folha=document.createElement('div');
 folha.id='tafPrintSheet';folha.innerHTML=paginas;
 document.body.appendChild(folha);
 document.body.classList.add('tafPrintMode');
 const limpar=function(){document.body.classList.remove('tafPrintMode');folha.remove()};
 window.addEventListener('afterprint',limpar,{once:true});
 window.print();
}

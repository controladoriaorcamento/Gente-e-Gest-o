/* Preenchimento Gente e Gestão 2027 — tela inicial (login, liberação por formulário e painel dos masters).
   Os formulários em si ficam em form-1.html, form-2.html… (HTML originais da Gente e Gestão ligados à base).
   Segurança no banco (RLS + funções): o gerente só lê/grava o próprio formulário liberado; depois de devolvido,
   o banco recusa qualquer alteração até um master reabrir. Masters são definidos na tabela public.masters. */
(function(){
"use strict";
var C=window.GG_CONFIG||{};
var MASTERS=(C.MASTERS||[]).map(function(e){return String(e).toLowerCase()});
var FORMS=C.FORMULARIOS||[];
var DOMINIO=C.DOMINIO||'@btsa.com.br';

var $=function(id){return document.getElementById(id)};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
var VIEWS=['v-loading','v-erro','v-auth','v-recusado','v-ger','v-mst'];
function show(id){VIEWS.forEach(function(v){$(v).hidden=(v!==id)})}
var toastT;function toast(t){var el=$('toast');el.textContent=t;el.hidden=false;clearTimeout(toastT);toastT=setTimeout(function(){el.hidden=true},3800)}
function setMsg(el,t,ok){el.textContent=t;el.className='msg '+(ok?'ok':'err')}
function agora(){return new Date().toISOString()}
function fmtDH(iso){if(!iso)return '—';try{var d=new Date(iso);return d.toLocaleDateString('pt-BR')+' às '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}catch(e){return iso}}
function ss(k,v){try{if(v===undefined)return sessionStorage.getItem(k);if(v===null)sessionStorage.removeItem(k);else sessionStorage.setItem(k,v)}catch(e){return null}}
function errTxt(e){var m=(e&&(e.message||e.error_description||e.msg))||String(e||'');return m.replace(/^.*?ERROR:\s*/,'')}
function formInfo(id){return FORMS.filter(function(f){return f.id===id})[0]||{id:id,nome:id,curto:id,arquivo:'#'}}

if(!window.supabase||!C.SUPABASE_URL||!C.SUPABASE_KEY){show('v-erro');$('erro-txt').textContent='Configuração ausente (config.js). Fale com a TI.';return}
var sb=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'gg2027-auth'}});

/* digitação: e-mail em minúsculas, nome em maiúsculas (padrão dos formulários) */
document.addEventListener('input',function(ev){
  var el=ev.target;if(!el||el.tagName!=='INPUT')return;
  if(el.type==='email'){var lo=el.value.toLowerCase();if(lo!==el.value){var a=el.selectionStart;el.value=lo;try{el.setSelectionRange(a,a)}catch(e){}}return}
  if(el.type==='text'&&!el.classList.contains('keep')){var up=el.value.toUpperCase();if(up!==el.value){var s=el.selectionStart,e2=el.selectionEnd;el.value=up;try{el.setSelectionRange(s,e2)}catch(e){}}}
},true);

/* ---------- acesso ---------- */
var me=null,perfil=null,isMaster=false;
async function boot(){
  try{var r=await sb.auth.getSession();if(r.data&&r.data.session){await entrar(r.data.session);return}}catch(e){}
  telaAcesso(false);
}
function telaAcesso(criar){
  show('v-auth');$('who').hidden=true;$('tabs').hidden=true;
  $('f-criar').hidden=!criar;$('f-login').hidden=!!criar;
  setTimeout(function(){(criar?$('c-email'):$('l-email')).focus()},50);
}
function mostraCodigo(){$('c-codigo-box').hidden=MASTERS.indexOf($('c-email').value.trim().toLowerCase())<0}
$('c-email').addEventListener('input',mostraCodigo);
$('go-criar').onclick=function(){$('c-email').value=$('l-email').value;mostraCodigo();telaAcesso(true)};
$('go-login').onclick=function(){$('l-email').value=$('c-email').value;telaAcesso(false)};

$('f-login').addEventListener('submit',async function(ev){
  ev.preventDefault();var msg=$('l-msg');
  var bloq=Number(ss('gg27_bloq')||0);
  if(bloq>Date.now()){setMsg(msg,'Muitas tentativas. Tente de novo às '+new Date(bloq).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'.');return}
  var email=$('l-email').value.trim().toLowerCase(),s=$('l-senha').value;
  if(!email||!s){setMsg(msg,'Informe e-mail e senha.');return}
  $('l-ok').disabled=true;setMsg(msg,'Entrando…',true);
  var r=await sb.auth.signInWithPassword({email:email,password:s});
  $('l-ok').disabled=false;
  if(r.error){
    var n=Number(ss('gg27_tent')||0)+1;ss('gg27_tent',String(n));
    if(n>=5){ss('gg27_bloq',String(Date.now()+5*60e3));ss('gg27_tent',null);setMsg(msg,'Senha incorreta 5 vezes. Aguarde 5 minutos ou peça à Gente e Gestão uma nova senha.')}
    else setMsg(msg,'E-mail ou senha incorretos. Tentativa '+n+' de 5. Se ainda não criou sua senha, clique em Primeiro acesso.');
    return;
  }
  ss('gg27_tent',null);$('l-senha').value='';msg.textContent='';
  entrar(r.data.session);
});

$('f-criar').addEventListener('submit',async function(ev){
  ev.preventDefault();var msg=$('c-msg');
  var email=$('c-email').value.trim().toLowerCase(),nome=$('c-nome').value.trim(),s1=$('c-senha').value,s2=$('c-senha2').value;
  if(!email.endsWith(DOMINIO)){setMsg(msg,'Use seu e-mail corporativo terminado em '+DOMINIO+'.');return}
  if(nome.length<3){setMsg(msg,'Informe seu nome completo.');return}
  if(s1.length<8||!/[A-Za-z]/.test(s1)||!/\d/.test(s1)){setMsg(msg,'A senha precisa ter 8 caracteres ou mais, com letras e números.');return}
  if(s1!==s2){setMsg(msg,'As duas senhas não são iguais.');return}
  $('c-ok').disabled=true;setMsg(msg,'Salvando…',true);
  var r=await sb.rpc('criar_senha',{p_email:email,p_nome:nome,p_senha:s1,p_codigo:($('c-codigo').value||'').trim().toUpperCase()||null});
  if(r.error){$('c-ok').disabled=false;setMsg(msg,errTxt(r.error));return}
  var l=await sb.auth.signInWithPassword({email:email,password:s1});
  $('c-ok').disabled=false;
  if(l.error){setMsg(msg,'Senha criada, mas não foi possível entrar agora. Use a tela Entrar.');return}
  $('c-senha').value='';$('c-senha2').value='';$('c-codigo').value='';msg.textContent='';
  toast(r.data==='redefinida'?'Nova senha criada.':'Senha criada. Bem-vindo(a)!');
  entrar(l.data.session);
});
$('btn-sair').addEventListener('click',async function(){await sb.auth.signOut();location.reload()});

async function entrar(session){
  me=session.user;
  try{
    var p=await sb.from('perfis').select('uid,email,nome,recusado_em').eq('uid',me.id).maybeSingle();
    if(p.error)throw p.error;perfil=p.data;
    var m=await sb.rpc('sou_master');if(m.error)throw m.error;isMaster=!!m.data;
  }catch(e){show('v-erro');$('erro-txt').textContent='Não foi possível carregar seu cadastro: '+errTxt(e);return}
  if(!perfil){await sb.auth.signOut();telaAcesso(true);setMsg($('c-msg'),'Seu cadastro não foi encontrado. Faça o primeiro acesso.');return}
  $('who').hidden=false;$('who-txt').innerHTML='<b>'+esc(perfil.nome)+'</b> · '+esc(perfil.email);
  $('who-role').textContent=isMaster?'Master':'Gerente';
  if(isMaster){$('tabs').hidden=false;irPara(location.hash==='#teste'?'teste':'painel')}
  else if(perfil.recusado_em)show('v-recusado');
  else startGerente();
}
function irPara(t){
  $('tab-painel').setAttribute('aria-selected',String(t==='painel'));$('tab-teste').setAttribute('aria-selected',String(t==='teste'));
  if(t==='painel')startMaster();else startGerente();
}
$('tab-painel').onclick=function(){irPara('painel')};
$('tab-teste').onclick=function(){irPara('teste')};
$('tab-teste').textContent='Meus formulários (teste)';

/* =================== GERENTE: lista dos formulários liberados =================== */
var nomesStatus={rascunho:'Em preenchimento',devolvido:'Devolvido',reaberto:'Reaberto',liberado:'Liberado, não iniciado',aguardando:'Aguardando liberação',recusado:'Recusado'};
function pill(st){return '<span class="pill '+esc(st)+'">'+esc(nomesStatus[st]||st)+'</span>'}

async function startGerente(){
  show('v-ger');$('ger-teste').hidden=!isMaster;$('btn-auto-lib').hidden=!isMaster;
  $('ger-wait-txt').textContent=isMaster?'Para testar, libere para você mesmo os formulários que quer validar.':'Seu acesso foi registrado. A Kamila Luna (Gente e Gestão) vai conferir sua solicitação e liberar o formulário que você deve preencher. Clique em “Verificar agora” mais tarde para ver se já foi liberado.';
  await carregarGerente();
}
async function carregarGerente(){
  var l=await sb.from('liberacoes').select('form,liberado_em').eq('uid',me.id);
  var r=await sb.from('respostas').select('form,status,atualizado_em,devolvido_em,reaberto_em,motivo_reabertura').eq('uid',me.id);
  if(l.error||r.error){show('v-erro');$('erro-txt').textContent='Não foi possível carregar seus formulários.';return}
  var libs=l.data.map(function(x){return x.form}).sort();
  var R={};r.data.forEach(function(x){R[x.form]=x});
  $('ger-wait').hidden=libs.length>0;$('ger-main').hidden=libs.length===0;
  $('ger-forms').innerHTML=libs.map(function(id){
    var f=formInfo(id),x=R[id],st=x?x.status:'liberado';
    var sub=x?(st==='devolvido'?'Devolvido em '+fmtDH(x.devolvido_em):st==='reaberto'?'Reaberto em '+fmtDH(x.reaberto_em)+(x.motivo_reabertura?' · Motivo: '+x.motivo_reabertura:''):'Salvo em '+fmtDH(x.atualizado_em)):'Ainda não iniciado';
    return '<div class="list-row" style="display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;justify-content:space-between;border:1px solid var(--line);border-radius:8px;padding:12px 14px">'+
      '<div style="min-width:0;flex:1 1 280px"><b>'+esc(f.nome)+'</b><div class="muted" style="font-size:12.5px">'+esc(f.desc||'')+'</div><div class="muted" style="font-size:12px;margin-top:2px">'+esc(sub)+'</div></div>'+
      '<div class="row">'+pill(st)+'<a class="btn primary" href="'+esc(f.arquivo)+'" style="text-decoration:none">'+(st==='devolvido'?'Ver':'Abrir formulário')+'</a></div></div>';
  }).join('');
}
$('btn-recarregar').onclick=function(){carregarGerente().then(function(){toast($('ger-main').hidden?'Ainda aguardando liberação.':'Formulário liberado.')})};
$('btn-auto-lib').onclick=function(){irPara('painel');setTimeout(function(){abrirLib(me.id)},400)};
window.addEventListener('focus',function(){if(me&&!$('v-ger').hidden)carregarGerente()});

/* =================== MASTER =================== */
var PER={},LIB={},RESP={},mLib=null,mAcao={},mstTimer=null;
function ehMaster(id){return PER[id]&&MASTERS.indexOf(String(PER[id].email).toLowerCase())>=0}
function libsDe(id){return (LIB[id]||[]).slice().sort()}
function statusForm(id,f){var r=RESP[id+'|'+f];return r?r.status:'liberado'}
function situacao(id){if(PER[id]&&PER[id].recusado_em)return 'recusado';return libsDe(id).length?'liberado':'aguardando'}

async function carregarMaster(){
  var r=await Promise.all([
    sb.from('perfis').select('uid,email,nome,criado_em,recusado_em,recusado_por,reset_liberado_em,reset_concluido_em'),
    sb.from('liberacoes').select('uid,form,liberado_em,liberado_por'),
    sb.from('respostas').select('uid,form,status,versao,atualizado_em,devolvido_em,reaberto_em,historico')
  ]);
  var bad=r.filter(function(x){return x.error})[0];
  if(bad){setMsg($('m-msg'),'Não foi possível carregar: '+errTxt(bad.error));return}
  PER={};LIB={};RESP={};
  r[0].data.forEach(function(x){PER[x.uid]=x});
  r[1].data.forEach(function(x){(LIB[x.uid]=LIB[x.uid]||[]).push(x.form)});
  r[2].data.forEach(function(x){RESP[x.uid+'|'+x.form]=x});
  $('m-atualizado').textContent='Atualizado às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  renderMst();
}
function startMaster(){
  show('v-mst');carregarMaster();
  clearInterval(mstTimer);mstTimer=setInterval(function(){if(!$('v-mst').hidden&&!mLib&&!Object.keys(mAcao).length)carregarMaster()},30000);
}
$('m-refresh').onclick=carregarMaster;

function renderMst(){
  var ids=Object.keys(PER),ger=ids.filter(function(id){return !ehMaster(id)});
  var pares=[];ger.forEach(function(id){if(situacao(id)==='liberado')libsDe(id).forEach(function(f){pares.push(statusForm(id,f))})});
  $('kpis').innerHTML=[['Solicitações pendentes',ger.filter(function(id){return situacao(id)==='aguardando'}).length],
    ['Gerentes liberados',ger.filter(function(id){return situacao(id)==='liberado'}).length],
    ['Formulários em preenchimento',pares.filter(function(s){return s!=='devolvido'}).length],
    ['Formulários devolvidos',pares.filter(function(s){return s==='devolvido'}).length]]
    .map(function(k){return '<div class="kpi"><div class="k">'+k[0]+'</div><div class="v">'+k[1]+'</div></div>'}).join('');

  /* solicitações */
  var pend=ger.filter(function(id){return situacao(id)==='aguardando'}).sort(function(a,b){return String(PER[a].criado_em).localeCompare(String(PER[b].criado_em))});
  var h='<thead><tr><th>Nome</th><th>E-mail</th><th>Pedido em</th><th>Ações</th></tr></thead><tbody>';
  if(!pend.length)h+='<tr><td colspan="4" class="muted">Nenhuma solicitação pendente. Quando um gerente criar a senha no primeiro acesso, ele aparece aqui.</td></tr>';
  pend.forEach(function(id){
    var p=PER[id];
    var acts='<div class="row"><button class="btn sm primary" data-a="lib" data-id="'+id+'">Aprovar e escolher formulário</button><button class="btn sm danger" data-a="recusar" data-id="'+id+'">Recusar</button></div>';
    if(mAcao[id]==='recusar')acts+='<div class="inline-confirm"><span>Recusar o acesso de '+esc(p.nome)+'?</span><button class="btn sm danger" data-a="recusar-ok" data-id="'+id+'">Confirmar recusa</button><button class="btn sm" data-a="cancel" data-id="'+id+'">Cancelar</button></div>';
    h+='<tr><td><b>'+esc(p.nome)+'</b></td><td>'+esc(p.email)+'</td><td>'+esc(fmtDH(p.criado_em))+'</td><td class="acts">'+acts+'</td></tr>';
  });
  $('sol-tbl').innerHTML=h+'</tbody>';

  /* gerentes liberados */
  var fil=$('m-filtro').value;
  var lib=ids.filter(function(id){if(situacao(id)!=='liberado')return false;var sts=libsDe(id).map(function(f){return statusForm(id,f)});
    if(fil==='teste')return ehMaster(id);
    if(fil==='devolvido')return sts.indexOf('devolvido')>=0;
    if(fil==='andamento')return sts.some(function(s){return s!=='devolvido'});
    return true});
  lib.sort(function(a,b){return (ehMaster(a)-ehMaster(b))||String(PER[a].nome).localeCompare(String(PER[b].nome))});
  h='<thead><tr><th>Gerente</th><th>Formulários</th><th>Ações</th></tr></thead><tbody>';
  if(!lib.length)h+='<tr><td colspan="3" class="muted">Nenhum gerente neste filtro.</td></tr>';
  lib.forEach(function(id){
    var p=PER[id];
    var forms=libsDe(id).map(function(f){
      var r=RESP[id+'|'+f],st=statusForm(id,f),fi=formInfo(f);
      var sub=r?(st==='devolvido'?'em '+fmtDH(r.devolvido_em)+' · versão '+r.versao:'salvo '+fmtDH(r.atualizado_em)):'não iniciado';
      var a='<div style="display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:4px 0"><b style="min-width:90px">'+esc(fi.curto||f)+'</b>'+pill(st)+'<span class="sub">'+esc(sub)+'</span>'+
        (r?'<a class="btn sm" href="'+esc(fi.arquivo)+'?uid='+encodeURIComponent(id)+'" style="text-decoration:none">Ver formulário</a>':'')+
        (st==='devolvido'?'<button class="btn sm" data-a="reabrir" data-id="'+id+'" data-f="'+f+'">Reabrir</button>':'')+'</div>';
      if(mAcao[id]==='reabrir|'+f)a+='<div class="inline-confirm"><input type="text" class="keep" id="mot-'+id+'-'+f+'" placeholder="Motivo da reabertura (aparece para o gerente)"><button class="btn sm primary" data-a="reabrir-ok" data-id="'+id+'" data-f="'+f+'">Reabrir</button><button class="btn sm" data-a="cancel" data-id="'+id+'">Cancelar</button></div>';
      return a;
    }).join('');
    var acts='<div class="row"><button class="btn sm" data-a="lib" data-id="'+id+'">Alterar formulários</button>'+
      (ehMaster(id)?'':'<button class="btn sm" data-a="senha" data-id="'+id+'">Liberar nova senha</button>')+'</div>';
    if(mAcao[id]==='senha')acts+='<div class="inline-confirm"><span>A senha atual deixa de funcionar. Ele cria outra em “Primeiro acesso” (vale por 7 dias).</span><button class="btn sm danger" data-a="senha-ok" data-id="'+id+'">Confirmar</button><button class="btn sm" data-a="cancel" data-id="'+id+'">Cancelar</button></div>';
    if(p.reset_liberado_em&&!p.reset_concluido_em)acts+='<div class="sub">nova senha liberada, aguardando</div>';
    h+='<tr><td><b>'+esc(p.nome)+'</b>'+(ehMaster(id)?' <span class="pill reaberto">Teste</span>':'')+'<div class="sub">'+esc(p.email)+'</div></td><td>'+forms+'</td><td class="acts">'+acts+'</td></tr>';
  });
  $('m-tbl').innerHTML=h+'</tbody>';

  /* recusados */
  var rec=ger.filter(function(id){return situacao(id)==='recusado'});
  $('rec-card').hidden=!rec.length;
  $('rec-tbl').innerHTML='<thead><tr><th>Nome</th><th>E-mail</th><th>Recusado</th><th></th></tr></thead><tbody>'+rec.map(function(id){var p=PER[id];
    return '<tr><td>'+esc(p.nome)+'</td><td>'+esc(p.email)+'</td><td>'+esc(fmtDH(p.recusado_em))+'<div class="sub">'+esc(p.recusado_por||'')+'</div></td><td><button class="btn sm" data-a="desrecusar" data-id="'+id+'">Desfazer recusa</button></td></tr>'}).join('')+'</tbody>';
}
$('m-filtro').addEventListener('change',renderMst);

async function acaoMaster(ev){
  var b=ev.target.closest('button[data-a]');if(!b)return;var id=b.dataset.id,a=b.dataset.a,f=b.dataset.f,msg=$('m-msg');
  if(a==='lib'){abrirLib(id);return}
  if(a==='reabrir'){mAcao={};mAcao[id]='reabrir|'+f;renderMst();var m=$('mot-'+id+'-'+f);if(m)m.focus();return}
  if(a==='senha'||a==='recusar'){mAcao={};mAcao[id]=a;renderMst();return}
  if(a==='cancel'){delete mAcao[id];renderMst();return}
  b.disabled=true;var r;
  if(a==='reabrir-ok'){r=await sb.rpc('reabrir_resposta',{p_uid:id,p_form:f,p_motivo:($('mot-'+id+'-'+f)||{}).value||''});if(!r.error)toast(formInfo(f).curto+' reaberto para '+PER[id].nome+'.')}
  if(a==='senha-ok'){r=await sb.rpc('liberar_nova_senha',{p_uid:id});if(!r.error)toast('Nova senha liberada. Avise o gerente para usar “Primeiro acesso”.')}
  if(a==='recusar-ok'){r=await sb.rpc('recusar_acesso',{p_uid:id,p_recusar:true});if(!r.error)toast('Acesso recusado.')}
  if(a==='desrecusar'){r=await sb.rpc('recusar_acesso',{p_uid:id,p_recusar:false});if(!r.error)toast('Recusa desfeita.')}
  if(r&&r.error){b.disabled=false;setMsg(msg,errTxt(r.error));return}
  delete mAcao[id];await carregarMaster();
}
$('sol-tbl').addEventListener('click',acaoMaster);$('m-tbl').addEventListener('click',acaoMaster);$('rec-tbl').addEventListener('click',acaoMaster);

/* liberação por formulário */
function abrirLib(id){mLib={id:id,forms:libsDe(id)};renderLib();$('m-lib').scrollIntoView({behavior:'smooth',block:'start'})}
function renderLib(){
  var el=$('m-lib');if(!mLib){el.hidden=true;return}el.hidden=false;
  var p=PER[mLib.id]||{email:me.email,nome:perfil.nome};
  var h='<div class="q-title"><div><h2>Formulários de '+esc(p.nome)+'</h2><p class="desc">'+esc(p.email)+'. Marque o formulário que esta pessoa deve preencher. Ela vê e preenche só os formulários marcados.</p></div><button class="btn sm" id="lib-fechar">Fechar</button></div>'+
    '<div style="display:flex;flex-direction:column;gap:8px">'+FORMS.map(function(f){
      var on=mLib.forms.indexOf(f.id)>=0,r=RESP[mLib.id+'|'+f.id];
      return '<label class="check" style="border:1px solid var(--line);border-radius:8px;padding:10px 12px"><input type="checkbox" data-lf="'+f.id+'"'+(on?' checked':'')+'><span><b>'+esc(f.nome)+'</b><br><span class="muted" style="font-size:12.5px">'+esc(f.desc||'')+(r?' · já tem dados preenchidos ('+esc(nomesStatus[r.status]||r.status)+')':'')+'</span></span></label>';
    }).join('')+'</div>'+
    '<div class="row"><button class="btn primary" id="lib-salvar">Salvar liberação</button><span class="msg" id="lib-msg"></span></div>';
  el.innerHTML=h;
}
$('m-lib').addEventListener('click',async function(ev){
  var b=ev.target.closest('button');if(!b)return;
  if(b.id==='lib-fechar'){mLib=null;renderLib();return}
  if(b.id==='lib-salvar'){
    var marcados=[].map.call($('m-lib').querySelectorAll('input[data-lf]:checked'),function(i){return i.dataset.lf});
    if(!marcados.length){setMsg($('lib-msg'),'Marque ao menos um formulário. Para negar o acesso, use “Recusar”.');return}
    var antes=libsDe(mLib.id),add=marcados.filter(function(f){return antes.indexOf(f)<0}),rem=antes.filter(function(f){return marcados.indexOf(f)<0});
    b.disabled=true;var r;
    if(add.length){r=await sb.from('liberacoes').insert(add.map(function(f){return {uid:mLib.id,form:f,liberado_por:perfil.email}}));if(r.error){b.disabled=false;setMsg($('lib-msg'),errTxt(r.error));return}}
    if(rem.length){r=await sb.from('liberacoes').delete().eq('uid',mLib.id).in('form',rem);if(r.error){b.disabled=false;setMsg($('lib-msg'),errTxt(r.error));return}}
    toast('Liberação salva.');var eraEu=mLib.id===me.id;mLib=null;renderLib();await carregarMaster();
    if(eraEu)toast('Liberação salva. Abra a aba “Meus formulários (teste)”.');
  }
});

/* exportação consolidada */
function csvE(v){v=v==null?'':String(v);return '"'+v.replace(/"/g,'""')+'"'}
function cel(v){if(v===true)return 'Sim';if(v===false)return 'Não';if(typeof v==='number')return String(v).replace('.',',');return v==null?'':v}
async function dadosExport(){
  var escopo=$('exp-scope').value;
  var r=await sb.from('respostas').select('uid,form,status,versao,dados,devolvido_em,atualizado_em');
  var e=await sb.from('entregas_form').select('uid,form,versao,dados').order('versao',{ascending:true});
  if(r.error||e.error)throw (r.error||e.error);
  var ENT={};e.data.forEach(function(x){ENT[x.uid+'|'+x.form]=x});
  return r.data.filter(function(x){
    if(!PER[x.uid])return false;
    if(escopo!=='tudo'&&ehMaster(x.uid))return false;
    if(escopo==='devolvido'&&x.status!=='devolvido')return false;
    return true;
  }).map(function(x){var en=ENT[x.uid+'|'+x.form];return {uid:x.uid,form:x.form,status:x.status,versao:x.versao,devolvido_em:x.devolvido_em,atualizado_em:x.atualizado_em,dados:(x.status==='devolvido'&&en)?en.dados:x.dados}});
}
function baixar(nome,conteudo,mime){
  var blob=new Blob([conteudo],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=nome;document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(function(){URL.revokeObjectURL(url)},2000);
  setMsg($('exp-msg'),'Arquivo '+nome+' gerado.',true);
}
$('btn-json').addEventListener('click',async function(){
  try{
    var L=await dadosExport();if(!L.length){setMsg($('exp-msg'),'Nenhum formulário neste filtro.');return}
    var out={exportadoEm:agora(),ciclo:'2027',formularios:L.map(function(x){return {formulario:x.form,nomeFormulario:formInfo(x.form).nome,gerente:PER[x.uid].nome,email:PER[x.uid].email,teste:ehMaster(x.uid),situacao:x.status,versao:x.versao,devolvidoEm:x.devolvido_em,dados:x.dados}})};
    baixar('gente_e_gestao_2027_consolidado_'+agora().slice(0,10)+'.json',JSON.stringify(out,null,2),'application/json');
  }catch(err){setMsg($('exp-msg'),'Não foi possível exportar: '+errTxt(err))}
});
/* CSV em blocos: um quadro por tipo (contratações, reajustes, …), com as colunas do próprio formulário */
$('btn-csv').addEventListener('click',async function(){
  try{
    var L=await dadosExport();if(!L.length){setMsg($('exp-msg'),'Nenhum formulário neste filtro.');return}
    var blocos={};
    function add(nome,ctx,obj){
      var b=blocos[nome]=blocos[nome]||{keys:[],rows:[]};
      Object.keys(obj).forEach(function(k){if(obj[k]===null||typeof obj[k]!=='object'){if(b.keys.indexOf(k)<0)b.keys.push(k)}});
      b.rows.push({ctx:ctx,obj:obj});
    }
    L.forEach(function(x){
      var d=x.dados||{},base=[formInfo(x.form).curto||x.form,PER[x.uid].nome,PER[x.uid].email,nomesStatus[x.status]||x.status,x.devolvido_em?fmtDH(x.devolvido_em):'',d.feriasConfirmadas?'Sim':'Não',d.numeroEmpresa||'',d.empresa||''];
      ['registros','obras','administrativo','prestadoresPJ'].forEach(function(sec){
        (Array.isArray(d[sec])?d[sec]:[]).forEach(function(rec,i){
          var local=rec.obra||rec.unidade||rec.departamento||'';
          var ctx=base.concat([sec,i+1,local]);
          add(sec,ctx,rec);
          Object.keys(rec).forEach(function(k){if(Array.isArray(rec[k]))rec[k].forEach(function(it){add(sec+' > '+k,ctx,it)})});
        });
      });
    });
    var head=['Formulario','Gerente','Email','Situacao','DevolvidoEm','FeriasConfirmadas','NumeroEmpresaGeral','EmpresaGeral','Secao','Registro','Obra/Unidade/Depto'];
    var lines=[];
    Object.keys(blocos).forEach(function(nome){
      var b=blocos[nome];
      lines.push(csvE(nome.toUpperCase()));
      lines.push(head.concat(b.keys).map(csvE).join(';'));
      b.rows.forEach(function(r){lines.push(r.ctx.concat(b.keys.map(function(k){return cel(r.obj[k])})).map(csvE).join(';'))});
      lines.push('');
    });
    baixar('gente_e_gestao_2027_consolidado_'+agora().slice(0,10)+'.csv','﻿'+lines.join('\r\n'),'text/csv;charset=utf-8');
  }catch(err){setMsg($('exp-msg'),'Não foi possível exportar: '+errTxt(err))}
});

boot();
})();

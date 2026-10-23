/* Preenchimento Gente e Gestão 2027 — versão Supabase.
   Segurança no banco (RLS + funções): o gerente só lê/grava o próprio formulário; depois de devolvido,
   o banco recusa qualquer alteração até um master reabrir. Masters são definidos na tabela public.masters. */
(function(){
"use strict";
var C=window.GG_CONFIG||{};
var MASTERS=(C.MASTERS||[]).map(function(e){return String(e).toLowerCase()});
var DOMINIO=C.DOMINIO||'@btsa.com.br';
var ANO='2027';
var RE_MES=/^(0[1-9]|1[0-2])\/(\d{4})$/;

var $=function(id){return document.getElementById(id)};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
var VIEWS=['v-loading','v-erro','v-auth','v-recusado','v-ger','v-mst'];
function show(id){VIEWS.forEach(function(v){$(v).hidden=(v!==id)})}
var toastT;function toast(t){var el=$('toast');el.textContent=t;el.hidden=false;clearTimeout(toastT);toastT=setTimeout(function(){el.hidden=true},3800)}
function setMsg(el,t,ok){el.textContent=t;el.className='msg '+(ok?'ok':'err')}
function agora(){return new Date().toISOString()}
function fmtDH(iso){if(!iso)return '—';try{var d=new Date(iso);return d.toLocaleDateString('pt-BR')+' às '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}catch(e){return iso}}
function brl(n){return (Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function rid(){return Math.random().toString(36).slice(2,10)}
function ss(k,v){try{if(v===undefined)return sessionStorage.getItem(k);if(v===null)sessionStorage.removeItem(k);else sessionStorage.setItem(k,v)}catch(e){return null}}
function clone(o){return JSON.parse(JSON.stringify(o))}
function errTxt(e){var m=(e&&(e.message||e.error_description||e.msg))||String(e||'');return m.replace(/^.*?ERROR:\s*/,'')}

if(!window.supabase||!C.SUPABASE_URL||!C.SUPABASE_KEY){show('v-erro');$('erro-txt').textContent='Configuração ausente (config.js). Fale com a TI.';return}
var sb=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'gg2027-auth'}});

/* ---------- padronização de digitação (igual ao formulário original) ---------- */
function mascaraMes(v){var d=v.replace(/\D/g,'').slice(0,6);return d.length<=2?d:d.slice(0,2)+'/'+d.slice(2)}
document.addEventListener('input',function(ev){
  var el=ev.target;if(!el||el.tagName!=='INPUT')return;
  if(el.classList.contains('mes')){el.value=mascaraMes(el.value);el.classList.remove('campo-erro');return}
  if(el.type==='email'){var lo=el.value.toLowerCase();if(lo!==el.value){var a=el.selectionStart;el.value=lo;try{el.setSelectionRange(a,a)}catch(e){}}return}
  if(el.type==='text'&&!el.classList.contains('keep')){var up=el.value.toUpperCase();if(up!==el.value){var s=el.selectionStart,e2=el.selectionEnd;el.value=up;try{el.setSelectionRange(s,e2)}catch(e){}}}
},true);

/* ---------- sessão ---------- */
var me=null,perfil=null,isMaster=false;

async function boot(){
  try{
    var r=await sb.auth.getSession();
    if(r.data&&r.data.session){await entrar(r.data.session);return}
  }catch(e){}
  telaAcesso(false);
}
function telaAcesso(criar){
  show('v-auth');$('who').hidden=true;$('tabs').hidden=true;
  $('f-criar').hidden=!criar;$('f-login').hidden=!!criar;
  setTimeout(function(){(criar?$('c-email'):$('l-email')).focus()},50);
}
$('c-email').addEventListener('input',function(){$('c-codigo-box').hidden=MASTERS.indexOf(this.value.trim().toLowerCase())<0});
$('go-criar').onclick=function(){$('c-email').value=$('l-email').value;$('c-codigo-box').hidden=MASTERS.indexOf($('c-email').value.trim().toLowerCase())<0;telaAcesso(true)};
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
  $('c-senha').value='';$('c-senha2').value='';msg.textContent='';
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
  if(isMaster){$('tabs').hidden=false;irPara('painel')}
  else if(perfil.recusado_em)show('v-recusado');
  else startGerente();
}

/* abas do master */
function irPara(t){
  $('tab-painel').setAttribute('aria-selected',String(t==='painel'));$('tab-teste').setAttribute('aria-selected',String(t==='teste'));
  if(t==='painel')startMaster();else startGerente();
}
$('tab-painel').onclick=function(){irPara('painel')};
$('tab-teste').onclick=function(){irPara('teste')};

/* =================== GERENTE =================== */
var F=null,ACESSO=null,depAtual=null,locked=false,saveT=null,saving=Promise.resolve(),gerTimer=null,dirty=false;

function vazioDep(){return {cargos:[{cargo:'',motivo:'aumento',qtd:1,salario:'',comp:''}],reajustes:[],treinamentos:[],outras:[],semPrevisao:false,obs:''}}
function depTemDados(d){if(!d)return false;return (d.cargos||[]).some(function(c){return c.cargo})||(d.reajustes||[]).some(function(r){return r.nome||r.cargo})||(d.treinamentos||[]).some(function(t){return t.tipo})||(d.outras||[]).some(function(o){return o.desc})}
function depLabel(a){return (a.numEmpresa?a.numEmpresa+' - ':'')+(a.empresa||'—')+' · Obra '+(a.obra||'—')+' · '+(a.departamento||'—')}

async function carregarGerente(inicial){
  var a=await sb.from('acessos').select('deptos').eq('uid',me.id).maybeSingle();
  var f=await sb.from('formularios').select('*').eq('uid',me.id).maybeSingle();
  if(a.error||f.error){setMsg($('dev-msg'),'Não foi possível atualizar. Verifique a conexão.');return}
  ACESSO=a.data;
  var r=f.data;
  if(inicial||!F){F=r?clone(r):{uid:me.id,nome:perfil.nome,ferias:false,ferias_em:null,deptos:{},status:'rascunho'};renderGer();return}
  if(r&&(r.status!==F.status||r.reaberto_em!==F.reaberto_em||r.devolvido_em!==F.devolvido_em)){
    var antes=F.status;
    if(r.status==='devolvido'||!dirty)F=clone(r);
    else['status','devolvido_em','reaberto_em','motivo_reabertura','reaberto_por','versao','historico'].forEach(function(k){F[k]=r[k]});
    renderGer();if(antes==='devolvido'&&r.status==='reaberto')toast('A Gente e Gestão reabriu seu formulário.');
  }else if(!F.deptos||!Object.keys(F.deptos).length||JSON.stringify((ACESSO&&ACESSO.deptos)||[])!==JSON.stringify(window.__ultAcesso||[]))renderGer();
  window.__ultAcesso=(ACESSO&&ACESSO.deptos)||[];
}
async function startGerente(){
  show('v-ger');$('ger-teste').hidden=!isMaster;$('btn-auto-lib').hidden=!isMaster;
  $('ger-wait-txt').textContent=isMaster?'Para testar o formulário, libere departamentos de teste para você mesmo.':'Seu acesso foi registrado. A Kamila Luna (Gente e Gestão) vai conferir sua solicitação e informar quais departamentos você preenche. Recarregue a página mais tarde para ver se já foi liberado.';
  F=null;await carregarGerente(true);window.__ultAcesso=(ACESSO&&ACESSO.deptos)||[];
  clearInterval(gerTimer);gerTimer=setInterval(function(){if(!$('v-ger').hidden)carregarGerente(false)},60000);
}
window.addEventListener('focus',function(){if(me&&!$('v-ger').hidden)carregarGerente(false)});
$('btn-recarregar').onclick=function(){carregarGerente(false).then(function(){toast((ACESSO&&ACESSO.deptos&&ACESSO.deptos.length)?'Departamentos liberados.':'Ainda aguardando liberação.')})};
$('btn-auto-lib').onclick=function(){irPara('painel');setTimeout(function(){abrirLib(me.id)},400)};

function renderGer(){
  if(F===null)return;
  var deps=(ACESSO&&ACESSO.deptos)||[];
  $('ger-wait').hidden=deps.length>0;$('ger-main').hidden=deps.length===0;
  if(!deps.length)return;
  if(!F.deptos)F.deptos={};
  locked=F.status==='devolvido';
  var b=$('ger-banner');
  if(locked)b.innerHTML='<div class="banner lock"><b>Devolvido para a Gente e Gestão em '+esc(fmtDH(F.devolvido_em))+'.</b> O preenchimento está travado. Se precisar alterar algo, peça para a Kamila reabrir.</div>';
  else if(F.status==='reaberto')b.innerHTML='<div class="banner reopen"><b>Reaberto pela Gente e Gestão em '+esc(fmtDH(F.reaberto_em))+'.</b>'+(F.motivo_reabertura?' Motivo: '+esc(F.motivo_reabertura)+'.':'')+' Ajuste e devolva novamente.</div>';
  else b.innerHTML='';
  $('ger-status').innerHTML=pill(F.status||'rascunho');
  $('g-nome').value=F.nome||perfil.nome||'';$('g-email').value=perfil.email;$('g-ferias').checked=!!F.ferias;
  $('g-nome').disabled=locked;$('g-ferias').disabled=locked;
  var fe=$('g-ferias-em');fe.hidden=!(F.ferias&&F.ferias_em);fe.textContent=F.ferias_em?'Confirmação registrada em '+fmtDH(F.ferias_em)+'.':'';
  if(!depAtual||!deps.some(function(d){return d.id===depAtual}))depAtual=deps[0].id;
  deps.forEach(function(d){if(!F.deptos[d.id])F.deptos[d.id]=vazioDep()});
  var h='';deps.forEach(function(a){
    var d=F.deptos[a.id],st=d.semPrevisao?'<span class="st sem">Sem previsão</span>':depTemDados(d)?'<span class="st ok">Preenchido</span>':'<span class="st vazio">A preencher</span>';
    h+='<button type="button" class="dep-tab" data-dep="'+esc(a.id)+'" aria-pressed="'+(a.id===depAtual)+'"><span>'+esc(a.departamento||a.obra||'Departamento')+'</span><small>'+esc(depLabel(a))+'</small>'+st+'</button>';
  });
  $('deps').innerHTML=h;
  $('dev-card').hidden=locked;
  renderDep();
}
$('deps').addEventListener('click',function(ev){var b=ev.target.closest('.dep-tab');if(!b)return;depAtual=b.dataset.dep;renderGer()});

function pill(st){var m={rascunho:'Em preenchimento',devolvido:'Devolvido',reaberto:'Reaberto',aguardando:'Aguardando liberação',liberado:'Liberado, não iniciado',recusado:'Recusado'};return '<span class="pill '+esc(st)+'">'+esc(m[st]||st)+'</span>'}

var SEC={
  cargos:{t:'Previsão de contratações para 2027',un:['vaga','vagas'],cols:['Cargo','Motivo','Qtd.','Salário (R$)','Competência início contratação (MM/AAAA)'],add:'+ Adicionar vaga',novo:function(){return {cargo:'',motivo:'aumento',qtd:1,salario:'',comp:''}},
    f:[['cargo','text','Ex.: ANALISTA FINANCEIRO',1],['motivo','sel'],['qtd','number','1'],['salario','money','0,00'],['comp','mes','MM/AAAA']]},
  reajustes:{t:'Previsão de reajuste (por pessoa)',un:['registro','registros'],cols:['Nome','Cargo','% esperado','Mês previsto (MM/AAAA)'],add:'+ Adicionar reajuste',novo:function(){return {nome:'',cargo:'',pct:'',mes:''}},
    f:[['nome','text','Nome do colaborador',1],['cargo','text','Cargo'],['pct','number','Ex.: 5'],['mes','mes','MM/AAAA']]},
  treinamentos:{t:'Treinamentos previstos para a equipe',un:['registro','registros'],cols:['Tipo de treinamento','Mês (MM/AAAA)','Valor (R$)','Qtd. de pessoas'],add:'+ Adicionar treinamento',novo:function(){return {tipo:'',mes:'',valor:'',qtd:''}},
    f:[['tipo','text','Ex.: EXCEL AVANÇADO',1],['mes','mes','MM/AAAA'],['valor','money','0,00'],['qtd','number','0']]},
  outras:{t:'Outros gastos com pessoas que você precisa orçar',un:['registro','registros'],cols:['O que precisa ser orçado','Valor estimado (R$)','Observação'],add:'+ Adicionar item',novo:function(){return {desc:'',valor:'',obs:''}},
    f:[['desc','text','Ex.: CONSULTORIA PONTUAL',1],['valor','money','0,00'],['obs','text','Observação']]}
};

function renderDep(){
  var a=((ACESSO&&ACESSO.deptos)||[]).filter(function(x){return x.id===depAtual})[0];if(!a)return;
  var d=F.deptos[a.id],dis=locked?' disabled':'';
  ['cargos','reajustes','treinamentos','outras'].forEach(function(k){if(!Array.isArray(d[k]))d[k]=[]});
  var h='<div class="q-title"><h2>'+esc(a.departamento||'Departamento')+'</h2><span class="muted" style="font-size:12px">Liberado pela Gente e Gestão</span></div>'+
    '<div class="grid2">'+
    '<label class="f">Nº da empresa<input type="text" value="'+esc(a.numEmpresa)+'" readonly></label>'+
    '<label class="f">Nome da empresa<input type="text" value="'+esc(a.empresa)+'" readonly></label>'+
    '<label class="f">Obra<input type="text" value="'+esc(a.obra)+'" readonly></label>'+
    '<label class="f">Departamento<input type="text" value="'+esc(a.departamento)+'" readonly></label></div>'+
    '<div class="regra">Padrão de preenchimento: textos são gravados em <b>MAIÚSCULAS</b> e todo mês deve ser informado como <b>MM/AAAA</b> dentro de 2027 (exemplo: <b>01/2027</b>).</div>'+
    '<label class="check" for="d-sem"><input type="checkbox" id="d-sem"'+(d.semPrevisao?' checked':'')+dis+'><span>Este departamento não tem previsão de gastos com pessoas para 2027.</span></label>';
  if(!d.semPrevisao)Object.keys(SEC).forEach(function(k){h+='<hr class="div">'+quadro(k,d[k],locked)});
  h+='<hr class="div"><label class="f" for="d-obs">Observações deste departamento<textarea id="d-obs" class="keep"'+dis+'>'+esc(d.obs||'')+'</textarea></label>'+
    '<p class="muted" style="margin:0;font-size:12.5px">Lembrete: este preenchimento é uma previsão para o orçamento, sujeita à aprovação da diretoria da sua área, e não substitui a abertura da vaga na Gupy nem o formulário de aprovação de alteração de salário.</p>';
  $('dep-card').innerHTML=h;
}

function quadro(k,rows,ro){
  var S=SEC[k],n=rows.length,dis=ro?' disabled':'';
  var h='<div style="display:flex;flex-direction:column;gap:10px"><div class="q-title"><h3>'+esc(S.t)+'</h3><span class="n">'+n+' '+(n===1?S.un[0]:S.un[1])+'</span></div>';
  if(k==='outras')h+='<p class="desc" style="font-size:13px">Use para custos com gente que não cabem nos quadros acima: estágio, jovem aprendiz, contratação temporária, consultoria, freelancer, premiação da equipe ou evento de integração.</p>';
  h+='<div class="q-scroll"><table class="q"><thead><tr>'+(ro?'':'<th style="width:34px"></th>')+S.cols.map(function(c){return '<th>'+esc(c)+'</th>'}).join('')+'</tr></thead><tbody>';
  if(!n)h+='<tr><td colspan="'+(S.cols.length+1)+'" class="vazio-q">Nenhum registro. Use o botão abaixo para incluir.</td></tr>';
  rows.forEach(function(r,i){
    h+='<tr>'+(ro?'':'<td><button type="button" class="rm" data-rm="'+k+'" data-i="'+i+'" aria-label="Remover linha">&times;</button></td>');
    S.f.forEach(function(f){
      var nm=f[0],tp=f[1],ph=f[2]||'',v=r[nm]==null?'':r[nm],at=' data-s="'+k+'" data-i="'+i+'" data-f="'+nm+'"'+dis;
      var td=f[3]?'<td class="wide">':'<td>';
      if(tp==='sel')h+=td+'<select'+at+'><option value="aumento"'+(v==='aumento'?' selected':'')+'>Aumento de quadro</option><option value="reposicao"'+(v==='reposicao'?' selected':'')+'>Reposição</option></select></td>';
      else if(tp==='mes')h+=td+'<input type="text" class="mes" inputmode="numeric" maxlength="7" placeholder="'+ph+'" value="'+esc(v)+'"'+at+'></td>';
      else if(tp==='money'||tp==='number')h+=td+'<input type="number" min="0" step="'+(tp==='money'?'0.01':(nm==='pct'?'0.1':'1'))+'" placeholder="'+ph+'" value="'+esc(v)+'"'+at+'></td>';
      else h+=td+'<input type="text" placeholder="'+esc(ph)+'" value="'+esc(v)+'"'+at+'></td>';
    });
    h+='</tr>';
  });
  h+='</tbody></table></div>';
  if(!ro)h+='<button type="button" class="btn sm add" data-add="'+k+'">'+esc(S.add)+'</button>';
  return h+'</div>';
}

$('dep-card').addEventListener('input',function(ev){
  if(locked)return;var el=ev.target,d=F.deptos[depAtual];
  if(el.dataset.s){var v=el.value;if(el.type==='number')v=v===''?'':Number(v);d[el.dataset.s][Number(el.dataset.i)][el.dataset.f]=v;agendar();atualizaTabs()}
  else if(el.id==='d-obs'){d.obs=el.value;agendar()}
});
$('dep-card').addEventListener('change',function(ev){
  if(locked)return;var el=ev.target,d=F.deptos[depAtual];
  if(el.tagName==='SELECT'&&el.dataset.s){d[el.dataset.s][Number(el.dataset.i)][el.dataset.f]=el.value;agendar()}
  if(el.id==='d-sem'){d.semPrevisao=el.checked;agendar();renderGer()}
});
$('dep-card').addEventListener('click',function(ev){
  if(locked)return;var b=ev.target.closest('button');if(!b)return;var d=F.deptos[depAtual];
  if(b.dataset.add){d[b.dataset.add].push(SEC[b.dataset.add].novo());agendar();renderDep();var ins=$('dep-card').querySelectorAll('[data-s="'+b.dataset.add+'"][data-i="'+(d[b.dataset.add].length-1)+'"]');if(ins[0])ins[0].focus()}
  if(b.dataset.rm){d[b.dataset.rm].splice(Number(b.dataset.i),1);agendar();renderGer()}
});
function atualizaTabs(){var a=document.querySelector('.dep-tab[aria-pressed="true"] .st'),d=F.deptos[depAtual];if(!a)return;if(d.semPrevisao){a.className='st sem';a.textContent='Sem previsão'}else if(depTemDados(d)){a.className='st ok';a.textContent='Preenchido'}else{a.className='st vazio';a.textContent='A preencher'}}

$('g-nome').addEventListener('input',function(){if(locked)return;F.nome=this.value.trim();agendar()});
$('g-ferias').addEventListener('change',function(){if(locked)return;F.ferias=this.checked;F.ferias_em=this.checked?agora():null;agendar();renderGer()});

function agendar(){dirty=true;$('save-state').textContent='Alterações não salvas…';clearTimeout(saveT);saveT=setTimeout(salvar,900)}
function salvar(){
  if(locked)return saving;
  saving=saving.then(async function(){
    var row={uid:me.id,nome:F.nome||perfil.nome,ferias:!!F.ferias,ferias_em:F.ferias_em||null,deptos:clone(F.deptos||{}),atualizado_em:agora()};
    var r=await sb.from('formularios').upsert(row,{onConflict:'uid'});
    if(r.error){$('save-state').textContent='Não foi possível salvar. Verifique a conexão.';await carregarGerente(false);return}
    dirty=false;$('save-state').textContent='Salvo às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  }).catch(function(){});
  return saving;
}
window.addEventListener('beforeunload',function(e){if(dirty){e.preventDefault();e.returnValue=''}});

function pendencias(){
  var p=[],deps=(ACESSO&&ACESSO.deptos)||[];
  if(!(F.nome||'').trim())p.push('Informe o nome do gestor responsável.');
  if(!F.ferias)p.push('Confirme a programação de férias da equipe no Painel de Gestão.');
  deps.forEach(function(a){
    var d=F.deptos[a.id],nm=a.departamento||a.obra;
    if(!d||(!d.semPrevisao&&!depTemDados(d))){p.push(nm+': preencha ao menos um quadro ou marque "sem previsão".');return}
    if(d.semPrevisao)return;
    var meses=[];d.cargos.forEach(function(c){if(c.cargo){meses.push(['contratação '+c.cargo,c.comp]);if(!(Number(c.salario)>0))p.push(nm+': informe o salário de '+c.cargo+'.')}});
    d.reajustes.forEach(function(r){if(r.nome||r.cargo)meses.push(['reajuste '+(r.nome||r.cargo),r.mes])});
    d.treinamentos.forEach(function(t){if(t.tipo)meses.push(['treinamento '+t.tipo,t.mes])});
    meses.forEach(function(m){var mm=RE_MES.exec(String(m[1]||''));if(!mm||mm[2]!==ANO)p.push(nm+': mês de '+m[0]+' deve estar em MM/'+ANO+'.')});
  });
  return p;
}
function iniciarDevolucao(){
  var p=pendencias(),ul=$('dev-pend');
  if(p.length){ul.innerHTML=p.map(function(x){return '<li>'+esc(x)+'</li>'}).join('');ul.hidden=false;setMsg($('dev-msg'),'Corrija as pendências acima antes de devolver.');return}
  ul.hidden=true;$('dev-msg').textContent='';
  $('dev-acts').innerHTML='<span>Depois de devolver você não poderá mais editar. Confirma?</span><button class="btn primary" id="btn-dev-ok">Sim, devolver agora</button><button class="btn" id="btn-dev-no">Cancelar</button>';
}
async function confirmarDevolucao(btn){
  btn.disabled=true;clearTimeout(saveT);dirty=true;await salvar();
  var r=await sb.rpc('devolver_formulario');
  resetDevActs();
  if(r.error){setMsg($('dev-msg'),errTxt(r.error));return}
  toast('Formulário devolvido para a Gente e Gestão.');await carregarGerente(true);
}
function resetDevActs(){$('dev-acts').innerHTML='<button class="btn primary" id="btn-devolver">Devolver para a Kamila</button>'}
$('dev-acts').addEventListener('click',function(ev){
  var b=ev.target.closest('button');if(!b)return;
  if(b.id==='btn-devolver')iniciarDevolucao();
  else if(b.id==='btn-dev-no')resetDevActs();
  else if(b.id==='btn-dev-ok')confirmarDevolucao(b);
});

/* =================== MASTER =================== */
var PER={},ACS={},FRM={},ENT={},mLib=null,mView=null,mAcao={},mstTimer=null;
function ehMaster(id){return PER[id]&&MASTERS.indexOf(String(PER[id].email).toLowerCase())>=0}

async function carregarMaster(){
  var r=await Promise.all([
    sb.from('perfis').select('uid,email,nome,criado_em,recusado_em,recusado_por,reset_liberado_em,reset_concluido_em'),
    sb.from('acessos').select('uid,deptos,atualizado_em,atualizado_por'),
    sb.from('formularios').select('*'),
    sb.from('entregas').select('uid,versao,devolvido_em,dados').order('versao',{ascending:true})
  ]);
  var bad=r.filter(function(x){return x.error})[0];
  if(bad){setMsg($('m-msg'),'Não foi possível carregar: '+errTxt(bad.error));return}
  PER={};ACS={};FRM={};ENT={};
  r[0].data.forEach(function(x){PER[x.uid]=x});r[1].data.forEach(function(x){ACS[x.uid]=x});r[2].data.forEach(function(x){FRM[x.uid]=x});
  r[3].data.forEach(function(x){ENT[x.uid]=x});
  $('m-atualizado').textContent='Atualizado às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  renderMst();
}
function startMaster(){
  show('v-mst');carregarMaster();
  clearInterval(mstTimer);mstTimer=setInterval(function(){if(!$('v-mst').hidden&&!mLib)carregarMaster()},30000);
}
$('m-refresh').onclick=carregarMaster;

function statusDe(id){
  var p=PER[id],a=ACS[id],f=FRM[id];
  if(p&&p.recusado_em)return 'recusado';
  if(!a||!a.deptos||!a.deptos.length)return 'aguardando';
  if(!f)return 'liberado';return f.status||'rascunho';
}
function dadosOficiais(id){
  var f=FRM[id],e=ENT[id];
  if(f&&f.status==='devolvido'&&e)return {nome:e.dados.nome,ferias:e.dados.ferias,ferias_em:e.dados.ferias_em,deptos:e.dados.deptos,acessos:e.dados.acessos,devolvido_em:e.devolvido_em,historico:f.historico,versao:e.versao};
  return f;
}

function renderMst(){
  var ids=Object.keys(PER);
  var ger=ids.filter(function(id){return !ehMaster(id)});
  var c={aguardando:0,liberado:0,rascunho:0,reaberto:0,devolvido:0,recusado:0};ger.forEach(function(id){c[statusDe(id)]++});
  $('kpis').innerHTML=[['Solicitações pendentes',c.aguardando],['Gerentes liberados',c.liberado+c.rascunho+c.reaberto+c.devolvido],['Em preenchimento',c.liberado+c.rascunho+c.reaberto],['Devolvidos',c.devolvido]].map(function(k){return '<div class="kpi"><div class="k">'+k[0]+'</div><div class="v">'+k[1]+'</div></div>'}).join('');

  /* solicitações */
  var pend=ger.filter(function(id){return statusDe(id)==='aguardando'}).sort(function(a,b){return String(PER[a].criado_em).localeCompare(String(PER[b].criado_em))});
  var h='<thead><tr><th>Nome</th><th>E-mail</th><th>Pedido em</th><th>Ações</th></tr></thead><tbody>';
  if(!pend.length)h+='<tr><td colspan="4" class="muted">Nenhuma solicitação pendente. Quando um gerente criar a senha no primeiro acesso, ele aparece aqui.</td></tr>';
  pend.forEach(function(id){
    var p=PER[id],dup=ids.filter(function(o){return String(PER[o].nome).trim()===String(p.nome).trim()}).length>1;
    var acts='<div class="row"><button class="btn sm primary" data-a="lib" data-id="'+id+'">Aprovar e liberar departamentos</button><button class="btn sm danger" data-a="recusar" data-id="'+id+'">Recusar</button></div>';
    if(mAcao[id]==='recusar')acts+='<div class="inline-confirm"><span>Recusar o acesso de '+esc(p.nome)+'?</span><button class="btn sm danger" data-a="recusar-ok" data-id="'+id+'">Confirmar recusa</button><button class="btn sm" data-a="cancel" data-id="'+id+'">Cancelar</button></div>';
    h+='<tr><td><b>'+esc(p.nome)+'</b>'+(dup?'<div style="margin-top:4px"><span class="pill alerta">Nome repetido: confira</span></div>':'')+'</td><td>'+esc(p.email)+'</td><td>'+esc(fmtDH(p.criado_em))+'</td><td class="acts">'+acts+'</td></tr>';
  });
  $('sol-tbl').innerHTML=h+'</tbody>';

  /* gerentes liberados (inclui testes dos masters) */
  var fil=$('m-filtro').value;
  var lib=ids.filter(function(id){var s=statusDe(id);if(s==='aguardando'||s==='recusado')return false;
    if(fil==='teste')return ehMaster(id);
    if(fil==='devolvido')return s==='devolvido';
    if(fil==='andamento')return ['liberado','rascunho','reaberto'].indexOf(s)>=0;
    return true});
  lib.sort(function(a,b){var o={devolvido:0,reaberto:1,rascunho:2,liberado:3};return (o[statusDe(a)]-o[statusDe(b)])||String(PER[a].nome).localeCompare(String(PER[b].nome))});
  h='<thead><tr><th>Gerente</th><th>Departamentos</th><th>Situação</th><th>Ações</th></tr></thead><tbody>';
  if(!lib.length)h+='<tr><td colspan="4" class="muted">Nenhum gerente neste filtro.</td></tr>';
  lib.forEach(function(id){
    var p=PER[id],a=ACS[id],f=FRM[id],s=statusDe(id),deps=(a&&a.deptos)||[];
    var sit=pill(s);
    if(s==='devolvido')sit+='<div class="sub">em '+esc(fmtDH(f.devolvido_em))+' · versão '+esc(f.versao)+'</div>';
    else if(f&&f.atualizado_em)sit+='<div class="sub">salvo '+esc(fmtDH(f.atualizado_em))+'</div>';
    if(p.reset_liberado_em&&!p.reset_concluido_em)sit+='<div class="sub">nova senha liberada, aguardando</div>';
    var acts='<div class="row">'+
      '<button class="btn sm" data-a="lib" data-id="'+id+'">Editar departamentos</button>'+
      (f?'<button class="btn sm" data-a="ver" data-id="'+id+'">Ver formulário</button>':'')+
      (s==='devolvido'?'<button class="btn sm" data-a="reabrir" data-id="'+id+'">Reabrir</button>':'')+
      (ehMaster(id)?'':'<button class="btn sm" data-a="senha" data-id="'+id+'">Liberar nova senha</button>')+'</div>';
    var ac=mAcao[id];
    if(ac==='reabrir')acts+='<div class="inline-confirm"><input type="text" class="keep" id="mot-'+id+'" placeholder="Motivo da reabertura (aparece para o gerente)"><button class="btn sm primary" data-a="reabrir-ok" data-id="'+id+'">Reabrir</button><button class="btn sm" data-a="cancel" data-id="'+id+'">Cancelar</button></div>';
    if(ac==='senha')acts+='<div class="inline-confirm"><span>A senha atual deixa de funcionar. Ele cria outra em “Primeiro acesso” (vale por 7 dias).</span><button class="btn sm danger" data-a="senha-ok" data-id="'+id+'">Confirmar</button><button class="btn sm" data-a="cancel" data-id="'+id+'">Cancelar</button></div>';
    h+='<tr><td><b>'+esc((f&&f.nome)||p.nome)+'</b>'+(ehMaster(id)?' <span class="pill reaberto">Teste</span>':'')+'<div class="sub">'+esc(p.email)+'</div></td>'+
      '<td>'+(deps.length?deps.map(function(d){return '<div>'+esc(depLabel(d))+'</div>'}).join(''):'<span class="muted">—</span>')+'</td>'+
      '<td>'+sit+'</td><td class="acts">'+acts+'</td></tr>';
  });
  $('m-tbl').innerHTML=h+'</tbody>';

  /* recusados */
  var rec=ger.filter(function(id){return statusDe(id)==='recusado'});
  $('rec-card').hidden=!rec.length;
  $('rec-tbl').innerHTML='<thead><tr><th>Nome</th><th>E-mail</th><th>Recusado</th><th></th></tr></thead><tbody>'+rec.map(function(id){var p=PER[id];
    return '<tr><td>'+esc(p.nome)+'</td><td>'+esc(p.email)+'</td><td>'+esc(fmtDH(p.recusado_em))+'<div class="sub">'+esc(p.recusado_por||'')+'</div></td><td><button class="btn sm" data-a="desrecusar" data-id="'+id+'">Desfazer recusa</button></td></tr>'}).join('')+'</tbody>';

  if(mView&&FRM[mView])renderView();
}
$('m-filtro').addEventListener('change',renderMst);

async function acaoMaster(ev){
  var b=ev.target.closest('button[data-a]');if(!b)return;var id=b.dataset.id,a=b.dataset.a,msg=$('m-msg');
  if(a==='lib'){abrirLib(id);return}
  if(a==='ver'){mView=id;renderView();$('m-view').scrollIntoView({behavior:'smooth',block:'start'});return}
  if(a==='reabrir'||a==='senha'||a==='recusar'){mAcao={};mAcao[id]=a;renderMst();var m=$('mot-'+id);if(m)m.focus();return}
  if(a==='cancel'){delete mAcao[id];renderMst();return}
  b.disabled=true;var r;
  if(a==='reabrir-ok'){r=await sb.rpc('reabrir_formulario',{p_uid:id,p_motivo:($('mot-'+id)||{}).value||''});if(!r.error)toast('Formulário reaberto para '+PER[id].nome+'.')}
  if(a==='senha-ok'){r=await sb.rpc('liberar_nova_senha',{p_uid:id});if(!r.error)toast('Nova senha liberada. Avise o gerente para usar “Primeiro acesso”.')}
  if(a==='recusar-ok'){r=await sb.rpc('recusar_acesso',{p_uid:id,p_recusar:true});if(!r.error)toast('Acesso recusado.')}
  if(a==='desrecusar'){r=await sb.rpc('recusar_acesso',{p_uid:id,p_recusar:false});if(!r.error)toast('Recusa desfeita. A pessoa voltou para as solicitações.')}
  if(r&&r.error){b.disabled=false;setMsg(msg,errTxt(r.error));return}
  delete mAcao[id];await carregarMaster();
}
$('sol-tbl').addEventListener('click',acaoMaster);$('m-tbl').addEventListener('click',acaoMaster);$('rec-tbl').addEventListener('click',acaoMaster);

/* liberação de departamentos */
function abrirLib(id){
  mLib={id:id,deptos:clone((ACS[id]&&ACS[id].deptos)||[])};
  if(!mLib.deptos.length)mLib.deptos.push({id:rid(),numEmpresa:'',empresa:'',obra:'',departamento:''});
  renderLib();$('m-lib').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderLib(){
  var el=$('m-lib');if(!mLib){el.hidden=true;return}el.hidden=false;var p=PER[mLib.id]||{email:me.email,nome:perfil.nome},f=FRM[mLib.id];
  var h='<div class="q-title"><div><h2>Departamentos de '+esc(p.nome)+'</h2><p class="desc">'+esc(p.email)+'. Informe cada departamento/obra que esta pessoa vai preencher. Ela vê e preenche só o que estiver aqui.</p></div><button class="btn sm" id="lib-fechar">Fechar</button></div>'+
    '<div class="q-scroll"><table class="q"><thead><tr><th style="width:34px"></th><th>Nº empresa</th><th>Nome da empresa</th><th>Obra</th><th>Departamento</th></tr></thead><tbody>';
  mLib.deptos.forEach(function(d,i){
    var preenchido=f&&f.deptos&&depTemDados(f.deptos[d.id]);
    h+='<tr><td><button type="button" class="rm" data-lrm="'+i+'" aria-label="Remover departamento" title="'+(preenchido?'Atenção: este departamento já tem dados preenchidos':'Remover')+'">&times;</button></td>'+
      ['numEmpresa','empresa','obra','departamento'].map(function(k){var ph={numEmpresa:'Ex.: 03',empresa:'Ex.: BRASIL TERRENOS HOLDING SA',obra:'Ex.: 91200',departamento:'Ex.: FINANCEIRO'}[k];return '<td'+(k==='empresa'||k==='departamento'?' class="wide"':'')+'><input type="text" data-lk="'+k+'" data-i="'+i+'" value="'+esc(d[k])+'" placeholder="'+ph+'"></td>'}).join('')+'</tr>';
  });
  h+='</tbody></table></div><div class="row"><button class="btn sm" id="lib-add">+ Adicionar departamento</button></div>'+
    '<div class="row"><button class="btn primary" id="lib-salvar">Salvar e liberar</button><span class="msg" id="lib-msg"></span></div>';
  el.innerHTML=h;
}
$('m-lib').addEventListener('input',function(ev){var t=ev.target;if(t.dataset.lk)mLib.deptos[Number(t.dataset.i)][t.dataset.lk]=t.value.trim()});
$('m-lib').addEventListener('click',async function(ev){
  var b=ev.target.closest('button');if(!b)return;
  if(b.id==='lib-fechar'){mLib=null;renderLib();return}
  if(b.id==='lib-add'){mLib.deptos.push({id:rid(),numEmpresa:'',empresa:'',obra:'',departamento:''});renderLib();return}
  if(b.dataset.lrm){mLib.deptos.splice(Number(b.dataset.lrm),1);renderLib();return}
  if(b.id==='lib-salvar'){
    var deps=mLib.deptos.filter(function(d){return d.obra||d.departamento});
    if(!deps.length){setMsg($('lib-msg'),'Informe ao menos a obra ou o departamento.');return}
    b.disabled=true;
    var r=await sb.from('acessos').upsert({uid:mLib.id,deptos:deps,atualizado_em:agora(),atualizado_por:perfil.email},{onConflict:'uid'});
    if(r.error){b.disabled=false;setMsg($('lib-msg'),errTxt(r.error));return}
    toast('Departamentos liberados.');mLib=null;renderLib();carregarMaster();
  }
});

/* visualização somente leitura */
function renderView(){
  var el=$('m-view'),id=mView,f=dadosOficiais(id);if(!f){el.hidden=true;return}el.hidden=false;
  var p=PER[id]||{},deps=(f.acessos&&f.acessos.length?f.acessos:(ACS[id]&&ACS[id].deptos))||[];
  var h='<div class="q-title"><div><h2>Formulário de '+esc(f.nome||p.nome)+'</h2><p class="desc">'+esc(p.email)+' · '+pill(statusDe(id))+(f.devolvido_em?' · devolvido em '+esc(fmtDH(f.devolvido_em)):'')+'</p></div><button class="btn sm" id="view-fechar">Fechar</button></div>';
  if(FRM[id]&&FRM[id].status==='devolvido')h+='<p class="muted" style="margin:0;font-size:12.5px">Mostrando a cópia guardada no momento da devolução (versão '+esc(f.versao)+').</p>';
  h+='<p style="margin:0">Férias programadas no Painel de Gestão: <b>'+(f.ferias?'Sim, confirmado em '+esc(fmtDH(f.ferias_em)):'Não confirmado')+'</b></p>';
  if(f.historico&&f.historico.length)h+='<p class="muted" style="margin:0;font-size:12.5px">Histórico: '+f.historico.map(function(x){return esc(x.acao)+' em '+esc(fmtDH(x.em))+(x.motivo?' ('+esc(x.motivo)+')':'')}).join(' · ')+'</p>';
  deps.forEach(function(a){
    var d=(f.deptos||{})[a.id];
    h+='<div class="ro-dep"><h3>'+esc(a.departamento||'Departamento')+'<small>'+esc(depLabel(a))+'</small></h3>';
    if(!d||(!d.semPrevisao&&!depTemDados(d)))h+='<p class="muted" style="margin:0">Ainda não preenchido.</p>';
    else if(d.semPrevisao)h+='<p style="margin:0">Sem previsão de gastos com pessoas para 2027.</p>';
    else{
      h+=roTab('Contratações',['Cargo','Motivo','Qtd.','Salário','Início'],(d.cargos||[]).filter(function(c){return c.cargo}).map(function(c){return [c.cargo,c.motivo==='reposicao'?'Reposição':'Aumento de quadro',{n:c.qtd},{n:brl(c.salario)},c.comp]}));
      h+=roTab('Reajustes',['Nome','Cargo','% esperado','Mês'],(d.reajustes||[]).filter(function(r){return r.nome||r.cargo}).map(function(r){return [r.nome,r.cargo,{n:r.pct===''?'—':r.pct+'%'},r.mes]}));
      h+=roTab('Treinamentos',['Tipo','Mês','Valor','Pessoas'],(d.treinamentos||[]).filter(function(t){return t.tipo}).map(function(t){return [t.tipo,t.mes,{n:brl(t.valor)},{n:t.qtd}]}));
      h+=roTab('Outros gastos',['Descrição','Valor','Observação'],(d.outras||[]).filter(function(o){return o.desc}).map(function(o){return [o.desc,{n:brl(o.valor)},o.obs]}));
    }
    if(d&&d.obs)h+='<p style="margin:0"><span class="muted">Observações:</span> '+esc(d.obs)+'</p>';
    h+='</div>';
  });
  el.innerHTML=h;
}
function roTab(t,cols,rows){
  if(!rows.length)return '';
  return '<div><h3 style="font-size:14px;margin-bottom:6px">'+esc(t)+' <span class="muted" style="font-weight:400">('+rows.length+')</span></h3><div class="q-scroll"><table class="q"><thead><tr>'+cols.map(function(c){return '<th>'+esc(c)+'</th>'}).join('')+'</tr></thead><tbody>'+
    rows.map(function(r){return '<tr>'+r.map(function(v){return v&&typeof v==='object'?'<td class="num">'+esc(v.n)+'</td>':'<td>'+esc(v)+'</td>'}).join('')+'</tr>'}).join('')+'</tbody></table></div></div>';
}
$('m-view').addEventListener('click',function(ev){if(ev.target.id==='view-fechar'){mView=null;$('m-view').hidden=true}});

/* exportação */
function linhasExport(){
  var escopo=$('exp-scope').value,out=[];
  Object.keys(PER).forEach(function(id){
    if(escopo!=='tudo'&&ehMaster(id))return;
    var s=statusDe(id);if(s==='aguardando'||s==='recusado')return;if(escopo==='devolvido'&&s!=='devolvido')return;
    var f=dadosOficiais(id);if(!f)return;
    out.push({id:id,f:f,deps:(f.acessos&&f.acessos.length?f.acessos:(ACS[id]&&ACS[id].deptos))||[],s:s});
  });
  return out;
}
function baixar(nome,conteudo,mime){
  var blob=new Blob([conteudo],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=nome;document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(function(){URL.revokeObjectURL(url)},2000);
  setMsg($('exp-msg'),'Arquivo '+nome+' gerado.',true);
}
function csvE(v){v=v==null?'':String(v);return '"'+v.replace(/"/g,'""')+'"'}
function numBR(n){return (Number(n)||0).toFixed(2).replace('.',',')}
$('btn-csv').addEventListener('click',function(){
  var L=linhasExport();if(!L.length){setMsg($('exp-msg'),'Nenhum formulário neste filtro.');return}
  var head=['Gestor','EmailGestor','Situacao','DevolvidoEm','FeriasConfirmadas','Bloco','NumeroEmpresa','Empresa','Obra','Departamento','Descricao','Complemento','Quantidade','Valor'];
  var out=[head.map(csvE).join(';')];
  L.forEach(function(x){
    var g=[x.f.nome||PER[x.id].nome,PER[x.id].email,x.s,x.f.devolvido_em?fmtDH(x.f.devolvido_em):'',x.f.ferias?'SIM':'NAO'];
    x.deps.forEach(function(a){
      var d=(x.f.deptos||{})[a.id];if(!d)return;
      function push(bl,arr){out.push(g.concat([bl,a.numEmpresa,a.empresa,a.obra,a.departamento]).concat(arr).map(csvE).join(';'))}
      if(d.semPrevisao){push('Sem previsão',['','','','']);return}
      (d.cargos||[]).forEach(function(c){if(c.cargo)push('Contratação prevista',[c.cargo,(c.motivo==='reposicao'?'reposicao':'aumento')+(c.comp?' | Início: '+c.comp:''),c.qtd,numBR(c.salario)])});
      (d.reajustes||[]).forEach(function(r){if(r.nome||r.cargo)push('Reajuste',[r.nome+' ('+r.cargo+')','Mês: '+r.mes,'',(r.pct===''?'':r.pct)+'%'])});
      (d.treinamentos||[]).forEach(function(t){if(t.tipo)push('Treinamento',[t.tipo,'Mês: '+t.mes,t.qtd,numBR(t.valor)])});
      (d.outras||[]).forEach(function(o){if(o.desc)push('Outro gasto com pessoas',[o.desc,o.obs,'',numBR(o.valor)])});
    });
  });
  baixar('gente_e_gestao_2027_consolidado_'+agora().slice(0,10)+'.csv','﻿'+out.join('\r\n'),'text/csv;charset=utf-8');
});
$('btn-json').addEventListener('click',function(){
  var L=linhasExport();if(!L.length){setMsg($('exp-msg'),'Nenhum formulário neste filtro.');return}
  var payload={exportadoEm:agora(),ciclo:ANO,gerentes:L.map(function(x){return {nome:x.f.nome||PER[x.id].nome,email:PER[x.id].email,situacao:x.s,teste:ehMaster(x.id),devolvidoEm:x.f.devolvido_em||null,feriasConfirmadas:!!x.f.ferias,feriasConfirmadasEm:x.f.ferias_em||null,
    registros:x.deps.map(function(a){var d=(x.f.deptos||{})[a.id]||{};return {numeroEmpresa:a.numEmpresa,empresa:a.empresa,obra:a.obra,departamento:a.departamento,semPrevisao:!!d.semPrevisao,observacao:d.obs||'',
      cargos:(d.cargos||[]).filter(function(c){return c.cargo}).map(function(c){return {cargo:c.cargo,motivo:c.motivo,quantidade:Number(c.qtd)||1,salario:Number(c.salario)||0,competenciaInicioContratacao:c.comp||null}}),
      reajustes:(d.reajustes||[]).filter(function(r){return r.nome||r.cargo}).map(function(r){return {nome:r.nome,cargo:r.cargo,percentualEsperado:r.pct===''?null:Number(r.pct),mesPrevisto:r.mes}}),
      treinamentos:(d.treinamentos||[]).filter(function(t){return t.tipo}).map(function(t){return {tipoTreinamento:t.tipo,mes:t.mes,valor:Number(t.valor)||0,quantidadePessoas:Number(t.qtd)||0}}),
      outrasNecessidades:(d.outras||[]).filter(function(o){return o.desc}).map(function(o){return {descricao:o.desc,valorEstimado:Number(o.valor)||0,observacao:o.obs}})}})}})};
  baixar('gente_e_gestao_2027_consolidado_'+agora().slice(0,10)+'.json',JSON.stringify(payload,null,2),'application/json');
});

boot();
})();

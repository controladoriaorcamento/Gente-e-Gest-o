/* Ponte entre o formulário original (HTML do Gente e Gestão) e a base Supabase.
   - Carrega o rascunho do banco no lugar do localStorage e salva automaticamente.
   - Adiciona a barra superior, a devolução para a Gente e Gestão e a trava após devolver.
   - Para masters: abre o formulário de outra pessoa em modo somente leitura (?uid=...). */
(function(){
"use strict";
var FORM=document.currentScript.getAttribute('data-form');
var C=window.GG_CONFIG||{};
var INFO=(C.FORMULARIOS||[]).filter(function(f){return f.id===FORM})[0]||{id:FORM,nome:FORM};
var SECOES={F1:['#tab-dept'],F2:['#tab-obras','#tab-admin','#tab-pj']}[FORM]||[];
var sb=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'gg2027-auth'}});
var me=null,alvo=null,perfil=null,resp=null,somenteLeitura=false,saveT=null,saving=Promise.resolve(),pendente=false,ultimo=null;

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function fmtDH(iso){if(!iso)return '—';try{var d=new Date(iso);return d.toLocaleDateString('pt-BR')+' às '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}catch(e){return iso}}
function errTxt(e){return ((e&&(e.message||e.error_description))||String(e||'')).replace(/^.*?ERROR:\s*/,'')}
function $(id){return document.getElementById(id)}

window.GG={
  _inicial:null,
  rascunho:function(){return this._inicial?JSON.stringify(this._inicial):null},
  salvar:function(state){
    if(somenteLeitura||!me)return;
    ultimo=state;pendente=true;setSave('Alterações não salvas…');
    clearTimeout(saveT);saveT=setTimeout(gravar,800);
  }
};
function gravar(){
  if(!pendente||somenteLeitura)return saving;
  saving=saving.then(async function(){
    pendente=false;
    var dados=JSON.parse(JSON.stringify(ultimo||{}));
    var r=await sb.from('respostas').upsert({uid:me.id,form:FORM,dados:dados,atualizado_em:new Date().toISOString()},{onConflict:'uid,form'});
    if(r.error){pendente=true;setSave('Não foi possível salvar. Verifique a conexão.',true);verificarStatus();return}
    setSave('Salvo às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}));
  }).catch(function(){});
  return saving;
}
function setSave(t,err){var el=$('gg-save');if(el){el.textContent=t;el.style.color=err?'var(--danger)':'var(--ink-soft)'}}
window.addEventListener('beforeunload',function(e){if(pendente&&!somenteLeitura){e.preventDefault();e.returnValue=''}});

async function verificarStatus(){
  if(!me||alvo!==me.id)return;
  var r=await sb.from('respostas').select('status,reaberto_em,devolvido_em').eq('uid',me.id).eq('form',FORM).maybeSingle();
  if(r.error||!r.data||!resp)return;
  if(r.data.status!==resp.status&&!pendente)location.reload();
}

function bloquear(msgHtml){
  var w=document.querySelector('.wrap');
  w.innerHTML='<div class="card" style="max-width:640px"><h2>'+esc(INFO.nome)+'</h2><p style="margin:0;line-height:1.55">'+msgHtml+'</p><p style="margin:0"><a href="./" style="color:var(--accent-2)">← Voltar ao início</a></p></div>';
}

function barra(){
  var st=resp?resp.status:'rascunho';
  var nomes={rascunho:'Em preenchimento',devolvido:'Devolvido',reaberto:'Reaberto'};
  var cor={rascunho:'var(--accent)',devolvido:'var(--good)',reaberto:'var(--danger)'}[st];
  var h='<div class="card" style="gap:10px">'+
    '<div style="display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between">'+
    '<a href="./" style="color:var(--accent-2);font-size:13px">← Voltar ao início</a>'+
    '<span style="font-size:13px;color:var(--ink-soft)"><b style="color:var(--ink)">'+esc(perfil.nome)+'</b> · '+esc(perfil.email)+'</span>'+
    '<span style="font-size:12px;font-weight:600;border:1px solid '+cor+';color:'+cor+';border-radius:999px;padding:2px 10px">'+esc(nomes[st]||st)+'</span>'+
    '<span id="gg-save" style="font-size:12px;color:var(--ink-soft)">'+(somenteLeitura?'Somente leitura':'Salvamento automático ativado')+'</span></div>'+
    '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:12px;color:var(--ink-soft)">'+esc(INFO.nome)+'</div>';
  if(alvo!==me.id)h+='<div class="aviso" style="margin:0"><b>Visualização da Gente e Gestão.</b> Você está vendo o formulário de '+esc(perfil.nome)+' em modo somente leitura'+(st==='devolvido'?' (versão guardada na devolução de '+esc(fmtDH(resp.devolvido_em))+')':'')+'.</div>';
  else if(st==='devolvido')h+='<div class="aviso" style="margin:0;border-left-color:var(--good)"><b>Devolvido para a Gente e Gestão em '+esc(fmtDH(resp.devolvido_em))+'.</b> O preenchimento está travado. Se precisar alterar algo, peça para a Kamila reabrir.</div>';
  else if(st==='reaberto')h+='<div class="aviso" style="margin:0;border-left-color:var(--danger)"><b>Reaberto pela Gente e Gestão em '+esc(fmtDH(resp.reaberto_em))+'.</b>'+(resp.motivo_reabertura?' Motivo: '+esc(resp.motivo_reabertura)+'.':'')+' Ajuste e devolva novamente.</div>';
  $('gg-bar').innerHTML=h+'</div>';
}

function travar(){
  document.querySelectorAll('.wrap input, .wrap select, .wrap textarea, .wrap button').forEach(function(el){
    if(el.closest('#gg-bar')||el.closest('#gg-detalhe')||el.matches('.tab-btn,#btn-export-csv'))return;
    el.disabled=true;
  });
  var imp=$('input-import');if(imp&&imp.closest('label'))imp.closest('label').hidden=true;
  document.querySelectorAll('.add-row-btn,.primary-btn,.row-remove').forEach(function(b){if(b.id!=='btn-export-csv')b.hidden=true});
  // a lista de registros pode ser redesenhada: mantém os botões "Remover" desativados
  var lista=$('lista-registros');
  if(lista)new MutationObserver(function(){lista.querySelectorAll('button').forEach(function(b){b.disabled=true;b.hidden=true})}).observe(lista,{childList:true,subtree:true});
  if(lista)lista.querySelectorAll('button').forEach(function(b){b.disabled=true;b.hidden=true});
}

/* ---------- devolução ---------- */
function estadoAtual(){return ultimo||window.GG._inicial||{}}
function totalRegistros(s){return ['registros','obras','administrativo','prestadoresPJ'].reduce(function(t,k){return t+(Array.isArray(s[k])?s[k].length:0)},0)}
function pendencias(){
  var p=[],s=estadoAtual();
  if(!($('top-gestor-nome')||{}).value)p.push('Informe o nome do gestor responsável.');
  if(!($('top-ferias-confirm')||{}).checked)p.push('Marque a confirmação de que as férias da equipe já estão programadas no Painel de Gestão.');
  if(!totalRegistros(s))p.push('Adicione ao menos um registro à lista (botão "Adicionar … à lista").');
  SECOES.forEach(function(sel){
    var sec=document.querySelector(sel);if(!sec)return;
    var cheio=[].some.call(sec.querySelectorAll('input[type=text],input[type=date]'),function(i){return !i.readOnly&&i.value.trim()!==''});
    if(cheio){
      var nome={'#tab-dept':'Departamento / Obra','#tab-obras':'Obras','#tab-admin':'Unidades Administrativas','#tab-pj':'Prestadores PJ'}[sel];
      p.push('Há dados digitados em "'+nome+'" que ainda não foram adicionados à lista. Clique no botão "Adicionar … à lista" dessa parte (ou apague os campos) antes de devolver.');
    }
  });
  return p;
}
function cartaoDevolver(){
  var el=$('gg-devolver');
  el.innerHTML='<div class="card"><h2>Devolver para a Gente e Gestão</h2>'+
    '<p style="margin:0;font-size:13.5px;line-height:1.55;color:var(--ink-soft)">Quando terminar, devolva o formulário. Depois da devolução o preenchimento fica <b>travado</b>: para alterar algo, a Gente e Gestão precisa reabrir.</p>'+
    '<ul id="gg-pend" style="margin:0;padding-left:18px;color:var(--danger);font-size:13px" hidden></ul>'+
    '<div id="gg-dev-acts" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button type="button" class="primary-btn" id="gg-btn-dev">Devolver para a Gente e Gestão</button></div>'+
    '<div class="msg" id="gg-dev-msg"></div></div>';
  el.addEventListener('click',async function(ev){
    var b=ev.target.closest('button');if(!b)return;
    if(b.id==='gg-btn-dev'){
      var p=pendencias(),ul=$('gg-pend');
      if(p.length){ul.innerHTML=p.map(function(x){return '<li>'+esc(x)+'</li>'}).join('');ul.hidden=false;return}
      ul.hidden=true;
      $('gg-dev-acts').innerHTML='<span>Depois de devolver você não poderá mais editar. Confirma?</span><button type="button" class="primary-btn" id="gg-btn-ok">Sim, devolver agora</button><button type="button" class="secondary-btn" id="gg-btn-no">Cancelar</button>';
    }
    if(b.id==='gg-btn-no')cartaoDevolver();
    if(b.id==='gg-btn-ok'){
      b.disabled=true;clearTimeout(saveT);pendente=true;await gravar();
      var r=await sb.rpc('devolver_resposta',{p_form:FORM});
      if(r.error){var m=$('gg-dev-msg');m.textContent=errTxt(r.error);m.className='msg err';b.disabled=false;return}
      pendente=false;location.reload();
    }
  },{once:false});
}

/* ---------- detalhe somente leitura (para conferência) ---------- */
var ROT={cargo:'Cargo',motivo:'Motivo',quantidade:'Qtd.',salario:'Salário (R$)',competenciaInicioContratacao:'Início contratação',vinculo:'Vínculo',
  beneficioAlimentacao:'Vale alimentação',alimentacaoLocal:'Alimentação no local',beneficioTransporte:'Transporte',assistenciaMedica:'Assist. médica',
  horaExtra:'Hora extra',gratificacao:'Gratificação',outrosBeneficios:'Outros benef./variável',adicionalPericulosidadePct:'Pericul./Insal. (%)',
  nome:'Nome',percentualEsperado:'% esperado',mesPrevisto:'Mês previsto',tipoTreinamento:'Tipo de treinamento',mes:'Mês',valor:'Valor (R$)',
  quantidadePessoas:'Qtd. pessoas',incluiViagemPDL:'Inclui viagem (PDL)',descricao:'Descrição',valorEstimado:'Valor estimado (R$)',observacao:'Observação',
  origem:'Origem',destino:'Destino',nomePJ:'Nome do PJ',atividade:'Atividade',numeroEmpresa:'Nº da empresa',empresa:'Empresa',obra:'Obra',
  valorPrestacao:'Valor da prestação (R$)',tipoValor:'Valor é',mesInicio:'Mês de início',multiEmpresa:'Nota p/ mais de uma empresa',departamento:'Departamento',
  cidade:'Cidade',regional:'Regional',inicioObra:'Início da obra',fimObra:'Fim da obra',semPrevisaoTermino:'Sem previsão de término',
  valorMarmitaDiario:'Marmita diária (R$)',temAlojados:'Tem alojados',alojadosQtd:'Qtd. alojados',alojadosCargos:'Cargos alojados',jaCadastrada:'Já cadastrada',
  cnpj:'CNPJ',convenio:'Sindicato / convênio',convenioNaoSei:'Não sabe o convênio',unidade:'Unidade / local',
  cargos:'Contratações / quadro',reajustes:'Reajustes',treinamentos:'Treinamentos',outrasNecessidades:'Outros gastos com pessoas',desligamentos:'Desligamentos',transferencias:'Transferências',
  registros:'Departamentos / obras',obras:'Obras',administrativo:'Unidades administrativas',prestadoresPJ:'Prestadores PJ'};
function rot(k){return ROT[k]||k}
function val(v){if(v===true)return 'Sim';if(v===false)return 'Não';if(v==null||v==='')return '—';return String(v)}
function tabela(lista){
  var keys=[];lista.forEach(function(o){Object.keys(o).forEach(function(k){if(keys.indexOf(k)<0&&typeof o[k]!=='object')keys.push(k)})});
  return '<div class="quadro-scroll"><table class="quadro"><thead><tr>'+keys.map(function(k){return '<th>'+esc(rot(k))+'</th>'}).join('')+'</tr></thead><tbody>'+
    lista.map(function(o){return '<tr>'+keys.map(function(k){return '<td>'+esc(val(o[k]))+'</td>'}).join('')+'</tr>'}).join('')+'</tbody></table></div>';
}
function detalhe(){
  var s=estadoAtual(),h='<div class="card"><h2>Conferência detalhada</h2><p class="aviso-inline">Tudo o que está gravado neste formulário, registro por registro.</p>';
  h+='<p style="margin:0;font-size:13.5px">Gestor: <b>'+esc(s.gestorNome||'—')+'</b> · '+esc(s.gestorEmail||'')+(s.empresa?' · Empresa: <b>'+esc((s.numeroEmpresa?s.numeroEmpresa+' - ':'')+s.empresa)+'</b>':'')+
    ' · Férias programadas: <b>'+(s.feriasConfirmadas?'Sim':'Não')+'</b></p>';
  ['registros','obras','administrativo','prestadoresPJ'].forEach(function(sec){
    var arr=s[sec];if(!Array.isArray(arr)||!arr.length)return;
    h+='<h3 style="margin-top:6px">'+esc(rot(sec))+' ('+arr.length+')</h3>';
    if(arr.every(function(o){return Object.keys(o).every(function(k){return typeof o[k]!=='object'||o[k]===null})})){h+=tabela(arr);return}
    arr.forEach(function(o,i){
      var esc1=Object.keys(o).filter(function(k){return o[k]===null||typeof o[k]!=='object'});
      h+='<div style="border:1px solid var(--line);border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;gap:10px">'+
        '<div style="font-weight:600">'+(i+1)+'. '+esc(o.obra||o.unidade||o.departamento||'Registro')+'</div>'+
        '<div style="display:flex;flex-wrap:wrap;gap:4px 18px;font-size:12.5px;color:var(--ink-soft)">'+esc1.map(function(k){return '<span>'+esc(rot(k))+': <b style="color:var(--ink)">'+esc(val(o[k]))+'</b></span>'}).join('')+'</div>';
      Object.keys(o).forEach(function(k){
        if(Array.isArray(o[k])&&o[k].length)h+='<div><div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-soft);margin-bottom:4px">'+esc(rot(k))+' ('+o[k].length+')</div>'+tabela(o[k])+'</div>';
      });
      h+='</div>';
    });
  });
  $('gg-detalhe').innerHTML=h+'</div>';
}

/* ---------- início ---------- */
async function iniciar(){
  var s=await sb.auth.getSession();
  if(!s.data||!s.data.session){location.replace('./');return}
  me=s.data.session.user;
  var q=new URLSearchParams(location.search);alvo=q.get('uid')||me.id;
  if(alvo!==me.id){
    var m=await sb.rpc('sou_master');
    if(m.error||!m.data){bloquear('Somente a Gente e Gestão pode ver o formulário de outra pessoa.');return}
  }
  var p=await sb.from('perfis').select('uid,email,nome,recusado_em').eq('uid',alvo).maybeSingle();
  if(p.error||!p.data){bloquear('Cadastro não encontrado.');return}
  perfil=p.data;
  var l=await sb.from('liberacoes').select('form').eq('uid',alvo).eq('form',FORM).maybeSingle();
  if(alvo===me.id&&(!l.data||perfil.recusado_em)){bloquear('Este formulário ainda não foi liberado para você. A Kamila Luna (Gente e Gestão) libera os formulários de cada gerente.');return}
  var r=await sb.from('respostas').select('*').eq('uid',alvo).eq('form',FORM).maybeSingle();
  if(r.error){bloquear('Não foi possível carregar o formulário: '+esc(errTxt(r.error)));return}
  resp=r.data;
  var dados=resp?resp.dados:{};
  if(resp&&resp.status==='devolvido'){
    var e=await sb.from('entregas_form').select('dados,versao').eq('uid',alvo).eq('form',FORM).order('versao',{ascending:false}).limit(1);
    if(e.data&&e.data[0])dados=e.data[0].dados;
  }
  dados=JSON.parse(JSON.stringify(dados||{}));
  if(alvo===me.id){if(!dados.gestorNome)dados.gestorNome=perfil.nome;dados.gestorEmail=perfil.email}
  window.GG._inicial=dados;
  somenteLeitura=alvo!==me.id||(resp&&resp.status==='devolvido');

  if(typeof window.GG_FORM_MAIN==='function')window.GG_FORM_MAIN();
  var em=$('top-gestor-email');if(em){em.readOnly=true;em.title='E-mail do seu cadastro'}
  barra();
  if(somenteLeitura){travar();detalhe()}
  else{cartaoDevolver();setInterval(verificarStatus,60000);window.addEventListener('focus',verificarStatus)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})();

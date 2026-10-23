// Projeto Supabase: gente-gestao-2027 (região São Paulo) — exclusivo do formulário de Gente e Gestão.
// A chave abaixo é a chave PÚBLICA (publishable). Quem protege os dados são as regras (RLS) do banco.
// NUNCA coloque aqui a "service_role key" / "secret key".
window.GG_CONFIG = {
  SUPABASE_URL: "https://ehkluteqohvvdkhgitye.supabase.co",
  SUPABASE_KEY: "sb_publishable_8B6xcAnmcgQia6Ik94htwQ_ptVgFGqT",
  DOMINIO: "@btsa.com.br",
  // Só para exibição (marcar "Teste" e mostrar o campo de código). Quem é master de verdade é a tabela public.masters no banco.
  MASTERS: ["kamila.luna@btsa.com.br", "evaldo.filho@btsa.com.br"],
  // Formulários que a Gente e Gestão pode liberar. Para incluir um novo: criar form-N.html e acrescentar aqui.
  FORMULARIOS: [
    { id: "F1", curto: "Formulário 1", nome: "Formulário 1 — Orçamento 2027 · Goiânia", arquivo: "form-1.html",
      desc: "Por departamento/obra: contratações, reajustes, treinamentos e outros gastos com pessoas." },
    { id: "F2", curto: "Formulário 2", nome: "Formulário 2 — Orçamento 2027 · Gestor", arquivo: "form-2.html",
      desc: "Obras, Unidades Administrativas e Prestadores PJ: quadro de cargos com benefícios, desligamentos, transferências, treinamentos e reajustes." }
  ]
};

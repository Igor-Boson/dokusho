-- Apelido do livro (2026-10-25). Só colunas novas.

-- display_name: o nome mostrado nas telas no lugar do título do EPUB; o título continua sendo a chave
-- do ttu (estatísticas, etiqueta do Anki). display_name_at: horário do aparelho que deu o apelido;
-- vence o mais novo, à parte do modified_at da linha (que é o da importação, ADR 0002).
alter table public.books
  add column display_name text,
  add column display_name_at timestamptz;

-- Hub de vocabulário (V2.1). Só colunas novas.

-- jmdict_ids: todas as entradas do JMdict em que a Palavra cai (um Card pode cair em mais de uma,
-- ADR 0008, 0013); jmdict_id segue com a primeira. ja_sei_at: quando você marcou "Já sei"; a marca
-- fica mesmo se a Palavra também estiver no Anki, para voltar a valer se o Card sumir.
alter table public.vocab
  add column jmdict_ids bigint[],
  add column ja_sei_at timestamptz;

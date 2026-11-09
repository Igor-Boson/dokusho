-- Notícias da NHK Easy (v4; ESCOPO "Notícias da NHK Easy"; ADR 0016, 0017).
--
-- news_articles e news_collection são escritas só pela Edge Function nhk (a Coleta); o app lê.
-- news_reads e news_editions são escritas pelo app, com a mesma regra das outras tabelas
-- (última escrita pelo horário do aparelho, soft delete).

-- Notícia: o texto (body_html) chega depois da linha, quando a Coleta baixa o artigo.
create table public.news_articles (
  user_id uuid not null references auth.users on delete cascade,
  news_id text not null,
  published_at timestamptz not null,
  title text not null,
  title_ruby text not null,
  body_html text,
  body_chars integer,
  image_url text,
  voice_uri text,
  fetched_at timestamptz,
  modified_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, news_id)
);

-- Notícia lida; desmarcar é soft delete.
create table public.news_reads (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  news_id text not null,
  read_at timestamptz not null,
  modified_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, news_id)
);

-- Edição do dia: dia pela hora de início do dia do app (AAAA-MM-DD) e as Notícias na ordem.
create table public.news_editions (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day text not null,
  news_ids text[] not null,
  modified_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, day)
);

-- Estado da Coleta: uma linha por usuário.
create table public.news_collection (
  user_id uuid not null references auth.users on delete cascade,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  articles integer not null default 0,
  with_text integer not null default 0,
  modified_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id)
);

do $$
declare
  t text;
begin
  foreach t in array array['news_articles', 'news_reads', 'news_editions', 'news_collection'] loop
    execute format(
      'create trigger touch_row before insert or update on public.%I
         for each row execute function public.touch_row()', t);
    execute format('create index %I on public.%I (user_id, updated_at)', t || '_cursor', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;

  foreach t in array array['news_reads', 'news_editions'] loop
    execute format(
      'create policy own_rows on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;

  foreach t in array array['news_articles', 'news_collection'] loop
    execute format(
      'create policy own_rows_read on public.%I for select to authenticated
         using (user_id = (select auth.uid()))', t);
  end loop;
end;
$$;

-- Coleta diária às 11h45 UTC (20h45 no Japão, 8h45 em Brasília), depois da publicação da NHK.
-- O endereço da função e o token ficam no Vault (nhk_coleta_url, nhk_coleta_token), criados fora
-- do repositório; sem eles o job só falha, sem efeito.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'nhk-coleta',
  '45 11 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'nhk_coleta_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-coleta', (select decrypted_secret from vault.decrypted_secrets where name = 'nhk_coleta_token')
    ),
    body := '{"acao":"coletar"}'::jsonb,
    timeout_milliseconds := 150000
  );
  $job$
);

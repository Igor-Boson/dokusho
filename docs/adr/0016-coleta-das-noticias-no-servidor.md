# Coleta das Notícias no servidor, numa Edge Function do Supabase

O Dokusho é uma PWA estática, e o navegador não consegue ler a NHK: as listas pedem um token que só
sai de uma cadeia de redirecionamentos com cookies (o aviso de quem acessa de fora do Japão), e a
NHK não libera CORS. A Coleta roda numa Edge Function `nhk` do Supabase que já temos, agendada pelo
pg_cron uma vez por dia e chamada também pelo app quando a última passou de 12 h. Ela grava as
Notícias em tabelas com RLS, que o sincronizador copia para o aparelho como as outras linhas.

## Considered Options

- GitHub Actions num repositório privado: funciona, mas é mais um repositório, mais um segredo com
  acesso ao banco e mais um lugar para quebrar. Fica como plano B se a NHK barrar os servidores do
  Supabase.
- Cloudflare Worker com cron: conta e deploy novos só para isso.
- launchd no Mac gerando EPUB no iCloud: depende do PC ligado e não serve no Windows.

## Consequences

- As fotos não ficam no servidor: a função busca as da Edição do dia quando o app pede, e o app
  guarda no aparelho uma cópia reduzida. O Storage não cresce com as Notícias.
- O repositório é público: as amostras reais da NHK usadas nos testes ficam fora do git
  (`nhk-amostras/`), e o repositório leva só uma amostra inventada com a mesma marcação.
- O áudio da NHK responde 403 fora do Japão (teste de 2026-11-09) e ficou de fora.

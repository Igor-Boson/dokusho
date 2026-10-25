# Arquitetura (como está construído)

Mapa do código do Dokusho no fim da v2, mais o furigana da v3. A especificação está em docs/ESCOPO.md, os motivos em
docs/adr/ e o registro datado de cada decisão em docs/historico/DECISOES.md. Atualize este arquivo
quando um módulo mudar de forma (não a cada detalhe).

O app é o fork do ttu em `apps/web` (SvelteKit estático). O código próprio fica em pastas com nomes
em português, ao lado do código do ttu, que segue com os nomes originais.

## Telas

| Rota                     | O que é                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `/` → `/inicio`          | Início: calendário da semana, meta, tempo e caracteres somando os aparelhos, por livro     |
| `/manage`                | Biblioteca do ttu (livro na nuvem como placeholder com ícone; apagar com confirmação)      |
| `/b?id=`                 | Leitor do ttu com a barra própria, o toque na palavra, o painel e a barra verde do Alcance |
| `/fila`                  | Fila de cartas e aba Lotes; `/fila?carta=<id>` abre a edição                               |
| `/settings?aba=`         | Configurações do ttu, mais Dicionário, Backup e Aparência (aba Data)                       |
| `/login`                 | Login por e-mail e senha (`/auth` é o callback antigo do ttu)                              |
| `/statistics`            | Estatísticas do ttu (só deste aparelho)                                                    |
| `/vocabulario`           | Vocabulário: Sincronização do Anki (botão só no Windows) e o hub                           |
| `/vocabulario/livro?id=` | Palavras do livro: cobertura e desconhecidas por frequência                                |

Navegação inferior (`lib/components/navegacao/`): Início, Biblioteca, Fila (com contador) e
Vocabulário. Os avisos "Nova versão" e "Servidor pausado" ficam no topo dessas
telas, nunca no leitor.

## Sincronização (`lib/data/supabase/sincronizacao/`, ADR 0001, 0002, 0014)

- `sincronizador.ts`: o motor. Cada rodada recebe (cursor exclusivo no `updated_at`, páginas por
  posição) e depois envia o que mudou desde o último envio. Última escrita vence pelo `modified_at`
  do aparelho; exclusão é soft delete. Testado com um servidor falso e dois aparelhos.
- `banco.ts`: IndexedDB `dokusho-sinc` (v3): título → hash do livro, enviados, cursores, EPUB até
  subir, Alcance, estatísticas dos outros aparelhos, marcador remoto pendente, `cartas`, `lotes`,
  `traducoes`, `vocab` (chave word + reading, índice pelas entradas do JMdict) e `retratos`
  (vocab_history). As lojas de linha seguem a mesma regra (`receberLinhas`/`enviarLinhas`).
- `regras.ts` (LWW, Alcance, conversões ttu ↔ linha), `servidor-supabase.ts`, `livro-zip.ts`.
- `iniciar.ts`: gatilhos (abrir o app, voltar a rede, trocar de plano, a cada 5 min, ~15 s depois de
  mudar o banco do ttu) e o estado `estadoSinc$` (inclui `sem-servidor`, que mostra o aviso de
  projeto pausado).
- Livro: id = SHA-256 do EPUB; no bucket `epubs/<user_id>/<hash>/` ficam `processado.zip`,
  `original.epub` e `capa`. O processado só desce quando você abre o livro.
- Estatísticas do ttu são só deste aparelho (`device_id` no localStorage); as dos outros ficam no
  `dokusho-sinc` e o Início soma.
- Sem login, nada sincroniza e o app segue local.

## Dicionário e toque (`lib/data/dicionario/`, `lib/components/painel-palavra/`; ADR 0003–0005, 0012)

- Formato (`formato.ts`, sem imports): entradas do JMdict com JPDB e JmdictFurigana, em blocos de 64
  ordenados pela leitura; índice termo → ids em blocos com busca binária. Preparado no PC por
  `tools/preparar-dicionario.ts`, subido por `tools/subir-dicionario.ts` ao bucket `dicts`; o app lê
  `<user_id>/dicionario/atual.json` para saber a versão e grava no IndexedDB `dokusho-dicionario`.
- Tokenizador `tokenizador.ts` (lindera-wasm-ipadic), wasm guardado no cache `dokusho-tokenizador`.
- `busca.ts`: o pedaço tocado dá o começo; o fim é o trecho mais longo que existe no dicionário, sem
  aceitar trecho que só acrescenta flexão (`soFlexao`); reservas (potencial, alongamento, っ final,
  katakana). Casos em `busca.casos.ts` (103).
- `servico.ts`: estado, download com aviso de tamanho, `consultarPalavra` com cache.
- Leitor: `leitor-dokusho.svelte` acha o caractere sob o toque (pointerdown/pointerup, porque o
  Safari não dispara `click` em área vazia), monta o parágrafo sem `<rt>` (`texto-do-dom.ts`) e
  realça com a CSS Custom Highlight API. `painel-palavra.svelte` (inferior até 767 px, lateral acima),
  `barra-leitor.svelte` (barra do topo do D1), `alcance-dom.ts` (barra verde).
- Casamento texto ↔ Anki: `lib/data/vocabulario/casamento.ts` (ADR 0008, 0013).

## Furigana gerado (`lib/data/furigana/`, ADR 0015)

- `gerado.ts` (puro, testado): leitura de cada pedaço (tokenizador conferido com o JMdict,
  JmdictFurigana kanji por kanji, regras de reserva), furigana de um parágrafo (pula o `<ruby>` do
  EPUB) e `mostrarFurigana` (regra do adaptativo). `gerado.medicao.test.ts`: as 30 frases do R5.
- `modo.ts`: `furiganaModo$` (Do livro, Todos, Adaptativo), por aparelho; "Sem furigana" é o
  `hideFurigana$` do ttu.
- Leitor: `painel-palavra/furigana-dom.ts` envolve os kanji em `span.dk-fg[data-r]` nos parágrafos
  perto da tela e marca `dk-fg--conhecida` (também no `<ruby>` do EPUB) pelo hub; o CSS em
  `leitor-dokusho.svelte` mostra a leitura conforme `html[data-dk-furigana]`. O menu ふ fica na
  `barra-leitor.svelte`.

## Hub de vocabulário (`lib/data/vocabulario/`; ADR 0007, 0008, 0013)

- `estados.ts`: estado de um Card (suspenso sem leech ou intervalo ≥ 21 → conhecida; leech suspenso,
  novo ou < 21 → aprendendo) e o mais avançado.
- `hub.ts`: Cards → Palavras (uma por Word + leituras, com as entradas do JMdict), as linhas de vocab
  que mudam (soft delete do que sumiu, salvo "Já sei"), retrato, "Já sei"/desfazer e Lote confirmado.
  Em vocab, `state` é o estado do Anki e `ja_sei_at` a marca; `estadoDaLinha` junta os dois.
- `sincronizar-anki.ts`: o fluxo do botão (rodada do sincronizador, `sync` do AnkiWeb, leitura,
  gravação no `dokusho-sinc`, retrato, Lotes, rodada de envio); `servico.ts` liga ao app (decks lidos,
  `sincAnki$`); `vocabMudou$` (em `iniciar.ts`) avisa as telas.
- `indice.ts`: o hub em memória para o texto (`IndiceDoHub`: estado pela entrada com qualquer
  leitura, "no Anki como", escrita para Cards sem entrada); `servico.ts` guarda um por vez e o refaz
  no `vocabMudou$`, e grava "Já sei"/desfazer.
- `importacao.ts`: "Já sei" inicial pela posição no JPDB (percorre o dicionário com
  `percorrerEntradas`) e desfazer por importação (mesmo `ja_sei_at`).
- Leitor: `painel-palavra/destaque-dom.ts` pinta aprendendo e desconhecida (Highlight API) nos
  parágrafos perto da tela; o painel mostra o estado e o "Já sei".
- `perfil.ts` (puro: perfil do livro, cobertura, desconhecidas) e `perfis.ts` (banco
  `dokusho-perfis`, fora da sincronização: o cálculo em fatias de 30 ms, `perfilPronto$`).
  Desde a V3.2 cada ocorrência guarda o fim do seu parágrafo, contado como o Alcance
  (`finsDosParagrafos` em `alcance-dom.ts`); daí saem as palavras vistas (`palavrasVistas`), o lido
  e a cobertura antes e depois do Alcance (`leituraDoLivro`) e as desconhecidas já vistas.
  Perfil sem posições (`FORMATO_DO_PERFIL` antigo) é recalculado.
- `lista.ts`: filtros e busca da lista do hub.
- Tela: `lib/components/vocabulario/` (`cartao-anki.svelte`, `palavras-vistas.svelte`, `livros-cobertura.svelte`,
  `importar-ja-sei.svelte`, `lista-hub.svelte`) em `/vocabulario`; `/vocabulario/livro?id=` com as desconhecidas
  (abas "Já vistas" e "No livro todo"). A
  Biblioteca (`book-card-list.svelte`) mostra a cobertura na capa.

## Cartas (`lib/data/cartas/`, ADR 0006, 0009, 0010; formato em docs/CARDS.md)

- `palavra.ts`, `frase.ts`, `furigana.ts`: a parte local da carta, montada no toque.
- `fila.ts`: gravar, tirar da fila, URL assinada do áudio. `geracao.ts`: uma carta por vez pela ação
  `generate`, só com rede e login. `traduzir.ts`: "Traduzir frase" com cache em `translations`.
- `exportar.ts` (o que entra, nota com os 14 campos, etiquetas) e `lotes.ts` (baixa os áudios, monta
  o .apkg e só grava o Lote depois da entrega; apaga do bucket o áudio de Lotes com mais de 30 dias).
- `lib/functions/anki/`: `guid.ts` e `apkg.ts` (port do genanki, comparado com
  `genanki-referencia.json`), `entregar-arquivo.ts` (Web Share ou download), `anki-connect.ts`
  (lista fixa de ações; docs/ANKI-CONNECT.md).

## Supabase (`supabase/`)

- Migrações em `supabase/migrations/` (tabelas do ESCOPO, RLS, trigger `touch_row` que ignora
  escrita mais velha, buckets, RPCs `gemini_reservar` e `gemini_travar`). Tipos em
  `apps/web/src/lib/data/supabase/database.types.ts`.
- Edge Function `supabase/functions/gemini/`: lógica pura (`wav.ts`, `textos.ts`, `modelos.ts`,
  `voz.ts`) testada pelo vitest; `index.ts` (Deno). Voz da palavra: dica de leitura → conferência →
  kana → marca "confira a voz". Erros com `erro`/`motivo` lidos no app por `erro-da-funcao.ts`.
- `supabase/tests/rls_check.sql`: conferência manual da RLS no SQL Editor.

## Outros

- Início: `lib/data/estatisticas/` (contas testadas em `inicio.ts`; aba Palavras em `palavras.ts`, a
  partir dos retratos de `vocab_history`).
- Bancos locais (IndexedDB): `books` (ttu), `dokusho-sinc` (sincronização e hub; fecha a conexão
  quando outra aba precisa atualizá-lo e avisa quando espera), `dokusho-dicionario`,
  `dokusho-perfis` (perfis dos livros, fora da sincronização).
- Backup: `lib/data/backup/` (zip com as tabelas em JSON; restaurar mescla, nada é apagado).
- Tema: `lib/data/tema.ts` e as variáveis `--dk-*` do `app.scss` (claro, escuro ou sistema).
- Atualização: `lib/data/atualizacao.ts` + `service-worker.ts` sem skipWaiting automático (ADR 0011).
- Padrões do leitor em `lib/data/store.ts`, aplicados uma vez por aparelho (marca
  `dokusho-padroes-do-leitor` no localStorage).
- Deploy: `apps/web/vercel.json` (só o `main` publica).

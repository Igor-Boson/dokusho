# Decisões tomadas durante a construção

Registro datado, do S1 ao fim da v1 (movido do PROGRESSO.md em 2026-10-21). Vale o que está aqui
quando não há ADR mais novo; o estado atual de cada módulo está resumido em docs/ARQUITETURA.md.

- 2026-10-15: backend trocado de Appwrite para Supabase (projeto já criado). ESCOPO atualizado.
- 2026-10-15: dicionários num bucket privado `dicts` do Supabase (não no git nem no site público).
- 2026-10-15: hospedagem na Vercel. Secret do Gemini se chama `GEMINI_KEY` (na verdade foi criado como `GEMINI_API_KEY`; ver R5).
- 2026-10-15: deck `日本語::1. Dokusho` (CARDS.md manda nos IDs); no app, áudio WAV e etiqueta só `dokusho`.
- 2026-10-20: entrevista de escopo. ESCOPO, CLAUDE.md, CARDS.md e FASES.md reescritos; registro em
  docs/ENTREVISTA.md, 11 ADRs em docs/adr/, termos em GLOSSARY.md. Principais mudanças: significado
  da carta em português pelo Gemini; guid com leitura; dicionário preparado no PC; "Já sei"; cards
  pelas conversas do Claude abandonados; Anki renomeado para 1. Dokusho / 2. Kaishi 1.5k / 3. Old.
- 2026-10-20: D1 aprovado no iPhone. Regra dos toques B: a barra do topo vem pela rolagem para cima;
  tocar fora do texto ou na pontuação só fecha o painel. Painel e telas aprovados sem mudanças.
  Detalhes em ESCOPO "Toque e painel" e logo abaixo da tabela de telas. Protótipo (descartável) no
  branch prototype/d1-telas, publicado como artifact privado.
- 2026-10-20: S1. pnpm 12.14.0 fixado em `packageManager` (avisa que ignora `pnpm.onlyBuiltDependencies`;
  o `allowBuilds` do pnpm-workspace.yaml cobre). vitest 3.2.4 (compatível com o vite 5.4). Supabase CLI
  2.121.0 como devDependency da raiz. `supabase status` não serve de prova de link (é da stack local);
  usar `npx supabase migration list`. No Windows, `corepack enable` sem admin dá EPERM: usar
  `--install-directory "$env:APPDATA\npm"`; `npx.ps1` exige ExecutionPolicy RemoteSigned (já feito).
- 2026-10-20: S2. Migração `20261020120000_schema_inicial.sql` aplicada (10 tabelas, RLS, buckets
  `epubs`/`audio`/`dicts` com pasta `<user_id>/`). Cada tabela tem `modified_at` (horário do aparelho);
  o trigger `touch_row` grava `updated_at` do servidor e **ignora update com `modified_at` mais velho**
  (LWW no servidor; um upsert perdedor não devolve linha). Sem FKs entre tabelas do app (ordem de
  sincronização livre). `gemini_usage`: o app só lê. Campos de `batch_items` em colunas, nomes do CARDS.md.
  Cliente em `apps/web/src/lib/data/supabase/` (`client.ts` lê `$env/static/public`;
  `create-client.ts` sem `$env`, para testes). Tela `/login` (a `/auth` continua sendo o callback do
  ttu); link em Configurações → Data → Conta; nada exige login ainda. `skipLibCheck` no tsconfig
  (tipos do auth-js brigam com o DOM do TS 6); `pnpm check` tem 27 erros, todos antigos do ttu.
  `rls.test.ts` fala com o projeto real (pulado sem .env); o teste "cadastro está desligado" falha até
  você desligar o cadastro. Verificação entre usuários: colar `supabase/tests/rls_check.sql` no SQL Editor.
- 2026-10-20: na primeira carga do `pnpm dev` o console mostra erros de HMR (o Vite reotimiza as
  dependências no meio); some ao recarregar. Não é bug do app.
- 2026-10-20: `pnpm build` com o `pnpm dev` rodando derruba o dev no Windows (EBUSY ao vigiar
  `apps/web/build/`). Rodar o build com o dev parado, ou subir o dev de novo depois.
- 2026-10-20: R1. Port em `apps/web/src/lib/functions/anki/`: `guidFor` (guid.ts), constantes do
  CARDS.md (modelo.ts), `gerarApkg(SQL, { notas, midias, timestamp })` (apkg.ts), `entregarArquivo`
  (Web Share se `canShare` aceita o arquivo, senão download). O guid é calculado dentro do `gerarApkg`
  pela Word e Word Reading (ADR 0006). Referência: `tools/genanki_referencia.py` (genanki 0.13.1, venv em
  `tools/.venv` com **Python 3.14**: o pyyaml não compila no 3.15) grava `genanki-referencia.json`, que
  os testes comparam linha a linha (col, notes, cards, media, schema). sql.js 1.15.1 carregado por
  import dinâmico (wasm de 685 KB, entra no cache do service worker). Zip sem compressão na mídia.
  Notas e cards usam `mod = timestamp` da geração: reimportar o mesmo arquivo não altera nada.
  O Safari só aceita `navigator.share` logo após um toque: gerar o arquivo antes e compartilhar num
  segundo toque (vale para o V1.6). `resolveJsonModule` ligado no tsconfig. Página provisória
  `/teste/apkg` (apagar no V1.6) gera um Lote falso com WAV sintético, no deck `日本語::0. Dokusho teste`
  por padrão (opção `deck` do `gerarApkg`, só para testes).
- 2026-10-20: R2. Cliente em `apps/web/src/lib/functions/anki/anki-connect.ts`
  (`criarAnkiConnect({ url, fetch })`): lista fixa de ações (`version`, `sync`, `deckNamesAndIds`,
  `findCards`, `cardsInfo`, `notesInfo`); qualquer outra, `getDeckStats` inclusive, é recusada antes
  do `fetch`. URL padrão `http://127.0.0.1:8765`. `buscarCards(raiz)` faz `findCards "deck:日本語"`
  (pega os subdecks) e `cardsInfo` + `notesInfo` em lotes de 200; `leech` vem das etiquetas da nota,
  suspenso é `queue = -1`, intervalo negativo é segundos. Tipo de nota sem `Word` usa o primeiro
  campo. Erros com `tipo`: `rede` (Anki fechado, CORS ou rede local: o navegador não diferencia),
  `tempo`, `anki`, `acao-proibida`. `sync` com limite de 5 min, incluindo a espera da coleção. Configuração e regras em
  docs/ANKI-CONNECT.md. Página provisória `/teste/anki` (apagar no V2.1).
- 2026-10-20: R3. Tokenizador `lindera-wasm-ipadic` 2.1.0 (ADR 0012; bancada contra o kuromoji no
  ADR). Wrapper em `apps/web/src/lib/data/dicionario/tokenizador.ts` (`Pedaco`: superfície, base,
  leitura em hiragana, classe, início). Init do wasm **assíncrono** (o Chrome recusa compilar wasm de mais de
  8 MB de forma síncrona na thread principal). O wasm sai como asset do Vite
  (`_app/immutable/assets/lindera_wasm_ipadic_bg.<hash>.wasm`); o service worker o tira do cache de
  build e não apaga caches `dokusho-*`; o app o guarda no cache `dokusho-tokenizador`.
  `optimizeDeps.exclude` no vite.config. Dicionário: `formato.ts` (tipos + conversor, sem imports para
  o Node rodar o .ts direto) e `tools/preparar-dicionario.ts` → `dicts/saida/<versao>/` com
  `dicionario.ndjson.gz` e `manifesto.json`; versão `jmdict-<data>-f<FORMATO>`. Cada entrada é um
  `seq` do JMdict com formas (escrita, leitura, `f` = JPDB da escrita, `fk` = JPDB da palavra em kana,
  `fu` = furigana só quando não cobre a palavra inteira) e sentidos (etiquetas + glosas EN; notas,
  referências e tabelas de formas ficam fora). Entradas ordenadas pela leitura (homófonos no mesmo
  bloco), blocos de 64; índice termo → ids em blocos de 512 termos ordenados, limites no cabeçalho,
  busca binária (serve para a busca por prefixo da seleção híbrida). No IndexedDB
  (`dokusho-dicionario`, separado do books-db) os blocos ficam como texto JSON; a versão só é
  gravada no fim (gravação interrompida recomeça). `tools/subir-dicionario.ts` sobe para
  `dicts/<user_id>/dicionario/<versao>/` e grava `<user_id>/dicionario/atual.json` (cache 0), que o
  app lê para saber a versão. JmdictFurigana 2.3.1+2026-09-25 baixado em `dicts/`. `tools/` fora do
  eslint (fora do tsconfig dele); `tools/package.json` com `"type": "module"`. Página provisória
  `/teste/dicionario` (apagar no V1.2), com opção de preparar um arquivo local sem login.
- 2026-10-20: R4. Casamento em `apps/web/src/lib/data/vocabulario/casamento.ts` (funções puras com
  `consultar` injetado). Palavra do hub = `{ seq, leitura }` (`chavePalavra` = `seq|leitura`, leitura em
  hiragana). `casarCard(consultar, Word, Word Reading)`: limpa HTML e `〜`, separa leituras por `・`/`、`
  (uma Palavra por leitura); liga as entradas com a escrita do Card e a leitura; Card só em kana (ou sem
  entrada com a escrita) liga também a mais frequente com a leitura, que é a que o texto escolhe
  (なる → 成る). `casarPedaco(consultar, pedaco)`: `null` para gramática (`ehGramatica`: 助詞, 助動詞,
  記号, 接頭詞, フィラー, その他, qualquer 非自立, 動詞 接尾 como せる/れる, e o que não tem kana nem
  kanji; 名詞 接尾 como さん conta); consulta a forma de dicionário, depois o verbo de origem do
  potencial (会える → 会う: o IPADIC dá o potencial como verbo e o JMdict não tem), depois a superfície;
  desempata pela leitura (no conjugado, pelo radical: 行っ いっ → いく, não ゆく) e, sem desempate, fica
  a mais frequente (`candidatas` traz as outras). `Pedaco` ganhou `subclasse` (detalhes[1] do IPADIC).
  `ordenarPorFrequencia` exportado do banco.ts. Medição em `casamento.medicao.test.ts` (pulada sem
  `MEDIR_CASAMENTO`; lê `dicts/saida/`, o EPUB e o AnkiConnect pelo Node, sem CORS).
- 2026-10-20: ADR 0013 (substitui a leitura do ADR 0008): texto e Anki casam pela entrada (seq) com
  qualquer leitura; a leitura só escolhe a entrada no texto. `indexarAnki(palavras)` → seq → leituras do
  Anki; `noAnki(indice, palavra)` → `{ leituras, outraLeitura }` ou undefined. O painel do V2.2 mostra
  "no Anki como <leitura>" quando `outraLeitura`; "Já sei" vale para a entrada (V2.2).
- 2026-10-20: o servidor do Vite manda `.gz` com `Content-Encoding: gzip` e o navegador já entrega
  descompactado; `prepararArquivo` olha os bytes mágicos antes de descompactar.
- 2026-10-20: o `pnpm dev` de outro chat na mesma pasta ocupa a 5173 e o novo sobe na 5174, que não
  está no `webCorsOriginList`. Para o R2, rodar o dev só na 5173.
- 2026-10-20: R5. Edge Function em `supabase/functions/gemini/`; lógica pura sem imports (`wav.ts`,
  `textos.ts`, `modelos.ts`, testada pelo vitest, que agora inclui `supabase/functions/**/*.test.ts`) e
  `index.ts` (Deno). Deploy com `--use-api` (sem Docker nem Deno no PC). O secret da chave é
  **`GEMINI_API_KEY`** (foi criado assim em 15/10; docs corrigidos). Configuração em secrets:
  `GEMINI_MODELOS_TEXTO=gemini-3.8-flash,gemini-3.5-flash-lite`,
  `GEMINI_MODELOS_TTS=gemini-3.8-flash-tts,gemini-3.8-flash-lite-tts` (os 2.5 só servem a quem já usava),
  `GEMINI_TETO_DIARIO=300`. API `generateContent` (a Interactions é a recomendada, mas o
  generateContent "remains fully supported"); o TTS pode vir como PCM cru ou WAV, `extrairPcm` aceita os dois.
  Migração `20261020180000_gemini.sql`: `sentence_before`/`sentence_after` em `batch_items` (contexto que
  o aparelho grava na parte local, V1.3); RPCs `gemini_reservar` (teto atômico, dia UTC) e `gemini_travar`
  (pendente/erro → gerando; trava com mais de 5 min é retomada), só para `service_role`. Cada chamada
  HTTP ao Gemini (inclusive tentativa e reserva) conta no teto. `generate` faz só o que falta (num "Tentar
  de novo" o que deu certo fica) e aceita `refazer: [texto | audio]` para o "Refazer áudio" do V1.5;
  reaproveita a tradução de `translations` e grava a sua lá. Erro de modelo (404, 429, 5xx, rede) passa
  para o de reserva; 3 rodadas com espera de 2 s e 6 s; 400/401/403 e teto param na hora. Áudio em
  `audio/<user_id>/leituras-<hash>.wav`; o hash da palavra inclui a instrução com a leitura. Instrução de
  pronúncia (em inglês, como nos exemplos do Google): `Say this Japanese word, pronounced 「<leitura>」: <palavra>`.
  Resposta do `generate`: `{ estado, motivo?, campos, medidas }` (409 `ocupada` se outra chamada gera).

- 2026-10-21: V1.1 (autônomo, revisar). **ADR 0014**: a sincronização não é um handler do ttu (eles
  copiam arquivos, pelo título, num gesto manual); é o módulo `lib/data/supabase/sincronizacao/`, que lê
  e grava o IndexedDB do ttu direto e troca linhas com o Supabase. `sincronizador.ts` (motor, testado com
  um servidor falso e dois aparelhos), `regras.ts` (LWW, Alcance, conversões), `banco.ts` (IndexedDB
  `dokusho-sinc`: título → hash, enviados, cursores, EPUB até subir, Alcance, estatísticas dos outros
  aparelhos, marcador remoto pendente), `servidor-supabase.ts`, `iniciar.ts` (gatilhos). Cada rodada
  recebe (cursor `updated_at`, páginas por posição) e depois envia o que mudou desde o último envio.
  Gatilhos: ao abrir o app, ao voltar a rede, ao trocar de plano (ida e volta), a cada 5 min em primeiro
  plano e ~15 s depois de uma mudança no banco do ttu (`database.mudou$`, novo). Migração
  `20261021120000_sincronizacao.sql`: `bookmarks.device_id/device_name`, `books.processed_size`,
  `reading_goals.goal_frequency`.
  Livro: hash SHA-256 do EPUB calculado na importação (antes de gravar no ttu); livros sem EPUB (de antes
  do V1.1, TXT, HTMLZ) usam o hash do texto processado e sobem sem original. No bucket `epubs`:
  `<user_id>/<hash>/processado.zip` (mesmo desenho do zip do ttu), `original.epub`, `capa`. No aparelho
  novo o livro vira um placeholder do ttu (sem texto, com capa) com ícone de nuvem; tocar baixa o
  processado com progresso. Dois livros com o mesmo título continuam impossíveis no mesmo aparelho (o
  ttu indexa pelo título); o segundo não desce.
  Marcador: sobe com Alcance (máximo pela leitura; um "desmarcar" mais novo vence), aparelho e nome. Ao
  abrir o livro, o leitor espera até 4 s pela sincronização; se outro aparelho tem marcador mais novo,
  pergunta "Você parou no iPad, cap. 3 (42%). Ir para lá?" (Ficar aqui / Ir para lá). Aparelho sem
  marcador recebe direto.
  Estatísticas: as do ttu são só deste aparelho (`device_id` aleatório no localStorage); as dos outros
  ficam em `dokusho-sinc` para a tela inicial somar (V1.4). Estatística apagada aqui é apagada no
  servidor. Aparelho que perdeu o banco recebe de volta as próprias. Metas: por `goal_start_date`, LWW.
  Apagar livro: confirmação ("some de todos os aparelhos… estatísticas e cartas ficam"), soft delete do
  livro e do marcador, arquivos do bucket apagados; reimportar depois devolve o livro.
  Padrões mudados no ttu: estatísticas ligadas e livros "placeholder" visíveis. `ConfirmDialog` aceita
  rótulos. Sem login, nada é sincronizado (o app segue local).
- 2026-10-21: V1.2 (autônomo, revisar). Busca em `lib/data/dicionario/busca.ts`: o toque escolhe o
  pedaço do tokenizador (começo); o fim é o trecho mais longo (até 6 pedaços, 14 caracteres, sem
  atravessar pontuação ou espaço) cujo termo "pedaços inteiros + forma de dicionário do último" está
  no dicionário; depois a superfície e as reservas (verbo do potencial, sem alongamento すごーい, sem っ
  final, katakana → hiragana). **Regra nova**: um trecho que só acrescenta flexão ao verbo ou adjetivo
  (auxiliar, て/で, verbo sufixo, verbo auxiliar depois de て) não vale, mesmo que o JMdict tenha a
  expressão (知らず, 急いで, 信じられない, 持ってくる, 呼ばれる): a palavra a estudar é o verbo; a seta ›
  alcança a expressão. Verbo composto (読み|終わる) continua inteiro. A seleção cobre a forma conjugada
  (立ち止まった, 食べさせられたくなかった), que vai em `<b>` na Frase. Setas: ‹ encurta e › alonga o
  fim em um pedaço; o começo é sempre o do pedaço tocado. Casos em `busca.casos.ts` (103 frases no
  estilo dos romances; o EPUB do R4 não está no repositório): 103/103 com um dicionário mínimo e com o
  JMdict inteiro (`busca.medicao.test.ts`, `MEDIR_DEFLEXAO=1`), busca no toque com mediana 0,08 ms e
  máximo 2,5 ms no Node. Lexicalizadas aceitas: 眠れる (o JMdict tem; o IPADIC dá o potencial como
  verbo), すごーい e カワイイ (formas do JMdict). O casamento do R4 usa as mesmas regras (potencial e
  gramática). `banco.ts` guarda na memória os últimos 64 blocos de índice e de entradas.
  `servico.ts`: estado do dicionário, `pedirDicionario()` (diálogo com o tamanho: dicionário + 18 MB do
  tokenizador se ainda não está no cache), `consultarPalavra` com as últimas 500 respostas,
  `medirConsultas()`. Configurações › Data › Dicionário: versão, data da versão, data do download,
  Baixar/Atualizar (compara com `atual.json`), Apagar deste aparelho, Medir velocidade (substitui a
  `/teste/dicionario`, que saiu). `dialog-template.svelte` ganhou `<script lang="ts">`: `pnpm check`
  caiu de 27 para **15** erros, todos antigos do ttu.
- 2026-10-21: V1.3 (autônomo, revisar). `lib/components/painel-palavra/`: `leitor-dokusho.svelte`
  (entra no leitor do ttu ao lado do BookReader) escuta o clique na janela; `caractereNoPonto`
  (caretRangeFromPoint/caretPositionFromPoint, 6 px de folga) acha o caractere; o parágrafo (p, h\*,
  li…) vira texto sem `<rt>` com o mapa de volta aos nós e os `<ruby>`; o tokenizador corta o
  parágrafo (guardado por parágrafo) e `selecionar` (V1.2) escolhe a palavra. Realce pela CSS Custom
  Highlight API (`::highlight(dokusho-selecao)`; Safari 17.2+); sem ela, sem realce. Regra B: palavra
  abre ou troca o painel; pontuação, margem ou fora do texto só fecham; arrastar a alça fecha. O
  primeiro toque sem dicionário abre o aviso de download (V1.2). Painel (`painel-palavra.svelte`, no
  desenho do D1): inferior até 767 px; na tela larga, lateral (360 px) **do lado oposto ao da palavra
  tocada** (com texto vertical o começo fica à direita). Mostra leitura e escrita da entrada aberta,
  "seleção: X → Y", entradas pela frequência (a que bate com o `<ruby>` do EPUB ou com a leitura do
  tokenizador primeiro, marcada "furigana do livro"), até 6 sentidos com etiquetas, JPDB, "não está no
  dicionário", "gramática · fora da cobertura", "Traduzir frase" (cache local de `translations`,
  depois a ação `translate`; desativado offline), "Na fila · <estado>" ou "Exportada em <data>",
  "Já sei" desativado (v2), "Criar carta" (ou "Na fila · abrir", que vai para `/fila?carta=<id>`);
  carta já exportada pede "Criar mesmo assim". Setas: ‹ e › mexem só no fim, por pedaço.
  Carta (`lib/data/cartas/palavra.ts`, `frase.ts`, `furigana.ts`): Word é a escrita da entrada (texto
  em kana pega a escrita mais frequente com a leitura: わかる → 分かる; entrada "uk" do JMdict fica em
  kana); Word Furigana pelo JmdictFurigana ou pelo alinhamento do okurigana (立[た]ち 止[ど]まる);
  Frase pelo ESCOPO (。！？ fora de 「」, corte em ~150 caracteres num 、 com "…"); Sentence com `<b>` na
  forma conjugada; Sentence Furigana pelos pedaços do tokenizador, com JmdictFurigana quando a escrita
  e a leitura batem; contexto (frase anterior e seguinte, inclusive dos parágrafos vizinhos); Frequency;
  `jmdict_id`; `book_id` = hash do livro. Gravada como `pendente` no `dokusho-sinc` (lojas novas
  `cartas`, `lotes`, `traducoes`, banco v2) e sincronizada por linha com `batch_items`/`lotes`
  (`translations` só desce). Barra do topo: no modo contínuo aparece ao rolar para trás (para cima, ou
  para a direita no vertical) e some ao avançar; no modo de páginas e no começo do capítulo vale a
  faixa do topo do ttu (32 px), que já existia. Barra verde: `alcance-dom.ts` conta o fim de cada
  parágrafo como o ttu conta o marcador, no HTML inteiro do livro (por seção, para o modo de páginas);
  `::before` com propriedades lógicas (à esquerda no horizontal, em cima no vertical), sem mudar o
  layout. O Alcance sobe com o `exploredCharCount`; "Desmarcar a partir daqui" é um ícone de borracha
  na barra do leitor (baixa o Alcance para o ponto atual e grava o marcador, que leva o Alcance aos
  outros aparelhos). Testado no painel do navegador com o dicionário local e um EPUB de teste
  (substituindo o `requestAnimationFrame`, que não roda com a janela oculta): 食べた → 食べる,
  気がついた → 気がつく, 漢字 com o furigana do livro, setas, pontuação fechando, carta gravada como o
  CARDS.md pede.
- 2026-10-21: V1.4 (autônomo, revisar). Rota `/inicio` (a raiz `/` passou a abrir o Início; o ttu
  abria o último livro). Navegação inferior (`lib/components/navegacao/`) em Início, Biblioteca
  (`/manage`) e Fila, com o número de cartas na fila; Vocabulário aparece desativado (v2). Contas em
  `lib/data/estatisticas/inicio.ts` (testadas): soma das linhas por dia e livro (as do ttu, que são
  deste aparelho, mais as dos outros aparelhos da sincronização), semana de segunda a domingo com
  setas, 7/30 dias/tudo (desde o primeiro dia lido), uma barra por dia (acima de 60 dias, por semana),
  lista por livro (com a capa do ttu; livro de outro aparelho que já foi apagado aparece como "Livro
  apagado"). Meta: a do ttu (`readingGoal$`, janela diária/semanal/mensal pelo `getReadingGoalWindow`),
  tempo e/ou caracteres; "Definir meta" abre Configurações na aba Statistics (`/settings?aba=`). Dias
  pela chave do ttu (com a hora de virada do dia das configurações). Tela clara, sem tema escuro.
- 2026-10-21: V1.5 (autônomo, revisar). Rota `/fila` (lista "Na fila") e `/fila?carta=<id>` (edição).
  Geração em `lib/data/cartas/geracao.ts` (testada): uma carta por vez, só com rede e login;
  sincroniza antes (a carta tem que estar no servidor) e depois (traz os campos); 409 `ocupada` fica
  para depois; as 3 tentativas ficam na função (R5). Gatilhos: ao abrir o app, ao voltar a rede, ao
  criar a carta no painel e ao abrir a Fila. "Tentar de novo" e "Refazer áudio" voltam a carta para
  `pendente` (a trava da função só aceita pendente/erro) e chamam `generate` (com `refazer: ['audio']`
  no segundo, levando o "Texto para a voz"). Edição: cada campo com a origem (dicionário, livro,
  JmdictFurigana, Gemini, JPDB, você, vazio), gravação ao sair do campo (LWW por linha), áudios pelo
  bucket `audio` com URL assinada de 1 h, marca "confira a voz" na lista e na edição, "Tirar da fila"
  (soft delete), carta exportada só para leitura. A Frase na lista mostra só o `<b>` (o resto do texto
  é escapado). A edição fica bloqueada enquanto a carta gera.
- 2026-10-21: V1.6 (autônomo, revisar). Regras em `lib/data/cartas/exportar.ts` (testadas): entram as
  geradas sem Lote (e as com erro, se marcar "Incluir a carta com erro"); nota com os 14 campos do
  CARDS.md, `[sound:<arquivo do bucket>]`, Frequency em texto, etiquetas `dokusho` e
  `dokusho::<título>` (livro desconhecido: só `dokusho`); tamanho estimado pelos áudios presentes
  (36 KB + 279 KB, R5); aviso acima de 100 cartas. `lib/data/cartas/lotes.ts`: baixa os áudios do
  bucket `audio` (o que faltar sai da nota e é contado), monta com o `gerarApkg` do R1 e só grava o
  Lote (`lotes`: data, `device_id`, `device_name`) e marca as cartas `exportada` + `lote_id` **depois**
  que o arquivo é entregue (compartilhar cancelado não marca nada). Dois toques: "Exportar .apkg"
  monta, "Compartilhar com o Anki"/"Baixar .apkg" entrega (Safari, R1). Aba "Lotes": data, aparelho,
  cartas, "Baixar este Lote de novo" (com aviso "Importe cada Lote num lugar só" quando o Lote é de
  outro aparelho). Carta exportada: "Reexportar (sobrescreve o Card no Anki)" volta para gerada sem
  Lote (se o áudio do Lote já saiu do bucket, refaz o áudio antes). Áudio: ao abrir a Fila, Lotes com
  mais de 30 dias têm os áudios apagados do bucket (menos os que outra carta ainda usa: mesmo nome de
  arquivo) e ganham `audio_deleted_at`. Migração `20261021180000_lotes.sql`. Saíram a `/teste/apkg`,
  o `wav-teste.ts` e a opção `deck` do `gerarApkg`; o R1 no iPhone passa a ser pela exportação de
  verdade (FASES V1.7 atualizado). Testado no navegador: o .apkg de uma carta abre no sql.js com o deck
  `日本語::1. Dokusho`, as etiquetas e os campos certos; o Lote aparece na aba.
- 2026-10-21: V1.7 (autônomo, revisar; **parcial**: o limite de uso acabou). Feito: service worker sem
  skipWaiting automático (espera a mensagem ATUALIZAR) e aviso "Nova versão do app · Atualizar" no topo
  de Início, Biblioteca e Fila, nunca no leitor (ADR 0011; `lib/data/atualizacao.ts`, verifica a cada
  hora e ao voltar ao app); manifesto do Dokusho (standalone, start_url ./inicio) e ícone próprio
  (livro aberto com marcador verde, gerado por script descartável); metas do iOS; título "Dokusho".
  Configurações: Drive, OneDrive e pasta local saem (`isStorageSourceAvailable` só aceita o
  navegador; grupos de sincronização do ttu escondidos); Backup (`lib/data/backup/`): zip com as 9
  tabelas em JSON, restauração por mescla (upsert; a última escrita vence, nada é apagado), "último
  backup: há N dias" (por aparelho). **Falta**: mensagem "servidor pausado; reative no painel" (ideia:
  erro de rede com navigator.onLine → aviso com o link do painel, ref tirado do PUBLIC_SUPABASE_URL);
  tudo o que é 👤 (Vercel, subdomínio, redirect do Auth, webCorsOriginList, testes no iPhone).
- 2026-10-21: o teto diário de 300 bateu ao criar cartas: `GEMINI_TETO_DIARIO` subiu para 100000
  (na prática, sem teto) a pedido do Igor, por enquanto. A Fila e o "Traduzir frase" agora mostram a
  mensagem da função (ex.: "teto diário … atingido") em vez de "non-2xx status code". Cartas que
  ficaram em erro pelo teto voltam com "Tentar de novo".
- 2026-10-21: modo escuro (pedido do Igor): cores do protótipo D1 como variáveis `--dk-*` no
  app.scss, escuras com o sistema em modo escuro; Configurações › Data › Aparência escolhe Sistema,
  Claro ou Escuro (`lib/data/tema.ts`, aplicado no app.html antes de desenhar). Vale para Início,
  Fila, edição, navegação e as telas do ttu que usam --background-color/--font-color (Biblioteca,
  Configurações). O leitor e o painel da palavra seguem o tema do ttu (aba Reader).
- 2026-10-21: "Por livro" vazio: o rastreador do ttu começa pausado e o `trackerAutoStartTime` era 0, então
  só contava tempo depois de tocar no ▶ do rodapé. Agora começa sozinho 1 s depois da primeira virada
  de página (pausa e volta sozinho com o app em segundo plano, como já fazia). O marcador (posição)
  já era salvo pelo auto-marcador do ttu.
- 2026-10-21: leitor como no protótipo D1 (pedido do Igor): barra do topo própria
  (`barra-leitor.svelte`: ‹ Biblioteca, título com capítulo e %, Aa 20→23→17, ふ liga/desliga o
  furigana do livro, menu ⋯ com Desmarcar a partir daqui, Sumário, Marcar este ponto, Ir para o
  marcador, Estatísticas, Opções de leitura e "Mais ferramentas do leitor", que abre a barra do ttu);
  sem o rodapé do ttu; padrões: Shippori Mincho, altura de linha 2,15, tema claro/escuro seguindo o
  app, e em tela de toque horizontal com rolagem (no PC, vertical com páginas, como o ESCOPO
  sugere). No celular: margens laterais maiores, 1,15 em entre parágrafos, folga de 55vh no fim, barra
  verde a 14 px do texto. Os padrões entram **uma vez por aparelho** (marca
  `dokusho-padroes-do-leitor` no localStorage), porque a tela de configurações do ttu já tinha gravado
  os antigos; depois, o que você mudar fica.
- 2026-10-21: V1.7 fechado no código: aviso "Servidor pausado ou fora do ar" (estado `sem-servidor` da
  sincronização quando há rede e o servidor não responde: "Failed to fetch", 54x, "paused") no topo de
  Início, Biblioteca e Fila, com o link do painel do projeto (ref tirado do PUBLIC_SUPABASE_URL) e
  "Tentar". O app segue com o que está no aparelho.
- 2026-10-21: teste da v1 no PC feito pelo Igor (10 cartas geradas, .apkg no Anki do PC sem duplicar,
  Início batendo). Teste no iPhone (dicionário, 30 toques, AnkiMobile) e entre dois aparelhos (mesmo
  ponto, soma do tempo, apagar livro): **dispensados pelo Igor** ("deve estar certo"); cobertos só
  pelos testes automáticos (sincronizador com dois aparelhos, deflexão, .apkg).
- 2026-10-21: deploy da v1 em https://dokusho-kappa.vercel.app (PR #1). Previews desligados no
  `apps/web/vercel.json` (`git.deploymentEnabled`: `**` false, `main` true; com mais de uma regra,
  basta uma ser true), porque o painel da Vercel não tem mais a opção do passo antigo. O PR aberto por
  engano no ttu original (ttu-ttu/ebook-reader#550) deve ser fechado.
- 2026-10-21: o leitor não desenha o texto no painel do navegador do Claude quando a janela está oculta
  (o livro está no IndexedDB, mas a página não pinta). Teste visual do leitor fica para o Igor.
- 2026-10-21: toque no espaço livre não tirava o realce no iPhone (o Safari não dispara `click` em área
  sem nada clicável): o leitor detecta o toque por pointerdown/pointerup. Navegação inferior 15% mais
  alta em tela de toque estreita (PR #3).
- 2026-10-21: passos do deploy feitos pelo Igor (Site URL do Auth, `webCorsOriginList` com a URL de
  produção, PWA no iPhone, teto de volta a 300, alerta de orçamento, rls_check). **v1 encerrada.**
  Documentos reorganizados: PROGRESSO só com estado e pendências; este registro e os testes de risco em
  docs/historico/; mapa do código em docs/ARQUITETURA.md; README do Dokusho.
- 2026-10-21: PR aberto por engano no ttu original (ttu-ttu/ebook-reader#550) fechado pelo Igor.

## v2 (chat autônomo de 2026-10-21, branch `v2-autonomo`)

- 2026-10-21: a branch `v2-autonomo` saiu do `main` com a `docs/organizar` por cima (fast-forward):
  o pedido da v2 já citava docs/historico/ e docs/ARQUITETURA.md, que só existiam nela. (autônomo,
  revisar)
- 2026-10-21: V2.1. Migração aditiva `20261022000000_hub.sql`: `vocab.jmdict_ids` (todas as entradas
  em que a Palavra cai) e `vocab.ja_sei_at` (a marca "Já sei"). Nas linhas do Anki, `state` é só o
  estado dos Cards; o "Já sei" fica à parte e o estado da Palavra é o mais avançado dos dois
  (`estadoDaLinha`). Assim, desfazer o "Já sei" volta ao estado do Anki, e uma Palavra que sai do Anki
  com "Já sei" vira linha `ja_sei` em vez de ser apagada. (autônomo, revisar)
- 2026-10-21: V2.1. Uma linha de vocab por Palavra = (Word sem HTML, leituras do Word Reading em
  hiragana juntas com ・, ex. 何 なに・なん). Vários Cards da mesma Palavra: estado mais avançado,
  `interval_days` = o maior, `suspended` só se todos estão, `leech` se algum tem. (autônomo, revisar)
- 2026-10-21: V2.1. Suspenso **com** leech é aprendendo mesmo com intervalo ≥ 21 dias (o ESCOPO diz
  "suspenso com leech: aprendendo" e "intervalo ≥ 21: conhecida" sem dizer qual vence; o leech é a
  palavra que você erra). Leech ativo (tirado da suspensão) segue o intervalo. (autônomo, revisar)
- 2026-10-21: V2.1. A Sincronização do Anki só regrava as linhas que mudaram (`synced_at` = quando
  mudou); a data da última sincronização vem do retrato mais novo de `vocab_history`, que vale em
  todos os aparelhos. Antes de ler o Anki, uma rodada do sincronizador recebe os "Já sei" dos outros
  aparelhos; depois, outra envia. (autônomo, revisar)
- 2026-10-21: V2.1. Lote confirmado no Anki quando **todas** as cartas dele (Word + Word Reading)
  estão em algum Card dos decks lidos; marca "✓ no Anki" na aba Lotes. (autônomo, revisar)
- 2026-10-21: V2.1. Botão "Sincronizar Anki" na tela Vocabulário (agora ligada na navegação), só
  quando o aparelho é Windows; nos outros, a data e os números do último retrato. Opções: decks lidos
  (localStorage, padrão `日本語` com subdecks) e pular o sync do AnkiWeb. Saíram a `/teste/anki` e o
  `listarDecks` do cliente, que só ela usava. (autônomo, revisar)
- 2026-10-21: V2.1, ensaio com o Anki real **só em leitura** (sem `sync`, com um banco falso em
  memória; nada gravado no hub): 1515 Cards → 1503 Palavras, 0 sem entrada, 23 em mais de uma
  entrada; 996 conhecidas, 507 aprendendo. 18,6 s no PC: 12,5 s lendo os Cards (cardsInfo/notesInfo
  em lotes de 200) e 6 s casando com o dicionário.

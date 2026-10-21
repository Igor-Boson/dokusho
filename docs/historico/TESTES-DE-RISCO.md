# Testes de risco (R1–R5 e furigana automático)

Resultados dos testes do ESCOPO "Riscos e testes antes de construir" (movido do PROGRESSO.md em
2026-10-21). O que ficou em aberto está em docs/PROGRESSO.md › Pendências.

## R1 · guid e .apkg (2026-10-20)

- guid: 12 casos (開く あく/ひらく, 止める, 方, kana, acentos, um valor só) iguais ao genanki. ✅
- .apkg: mesmas linhas de `col`, `notes` e `cards`, mesmo `media` e mesmos arquivos que o genanki. ✅
- PC (Chrome, dev): Lote de 100 cartas com 1 s + 4 s de áudio: sql.js 0,3 s, .apkg 3,3 s, 22,9 MB.
  Áudio real deve ser menor (silêncio cortado); medir de novo no R5.
- Anki do PC (2026-10-20): Lote de 100 importado; reimportar não duplica nem atualiza notas; tipos de
  nota só "Kaishi 1.5k" e "Leituras (estilo Kaishi)" (sem cópia); frente, verso e os dois áudios ok. ✅
- 👤 Falta: AnkiMobile e o Lote de 100 no iPhone a partir da PWA (precisa de HTTPS: Vercel ligada).

## R2 · AnkiConnect pelo navegador (2026-10-20)

- Cliente: 7 testes com `fetch` simulado (lista de ações, erros, lotes, etiquetas, leech). ✅
- `/teste/anki` no Chrome sem o Anki ouvindo: mostra o erro `rede`. ✅
- Chrome do Windows, `http://localhost:5173` no `webCorsOriginList`: CORS ok, `version` e `sync` ok. ✅
- Primeira rodada falhou logo depois do `sync`: "Collection lifecycle operation is active" (o Anki
  roda a sincronização da interface depois do `sync`). Corrigido: o cliente repete `deckNamesAndIds`
  a cada 0,5 s até a coleção liberar. ✅
- Leitura: 1514 Cards (`2. Kaishi 1.5k` 1500, `3. Old` 14, `1. Dokusho` 0, `日本語` 0); 71
  suspensos, 0 leech, 245 novos, 932 com intervalo ≥ 21 d. Intervalo e suspensão aparecem certos. ✅
- Leech: nenhum Card real tem a etiqueta; o caminho só está coberto pelo teste unitário.
- Para o R4: o Kaishi tem Word Reading com mais de uma leitura no mesmo campo (何 → `なに・なん`);
  o casamento pela entrada do JMdict precisa separar por `・`.
- Falta (V1.7): pôr a URL de produção no `webCorsOriginList` e repetir pela Vercel, com o prompt de
  rede local do Chrome.

## R3 · Tokenizador e dicionário (2026-10-20)

- Tokenizador: kuromoji.js e lindera (IPADIC nos dois) cortam igual; lindera carrega em 1,1 s contra
  3,6 s, tokeniza 10× mais rápido e usa 137 MB contra 320 MB (Node). Escolha no ADR 0012. ✅
- Dicionário: 218.914 entradas do JMdict, 67,1 MB de texto → **15,9 MB** gzip; conversão no PC em ~50 s.
- Download total: 15,9 MB (dicionário) + 16,5 MB (wasm em gzip; 18,0 MB sem compressão) ≈ **32 MB**
  ≤ 60 MB. ✅ Não conferido se a Vercel comprime o `.wasm`; se não comprimir, são 34 MB.
- PC (Chrome, dev): preparação (descompactar + IndexedDB) **5,6 s** ≤ 1 min ✅; tokenizador pronto em
  1,0 s a partir do cache; 77 consultas pela forma de dicionário de um texto de amostra: média 5 ms,
  p95 10 ms, máx 61–68 ms (a primeira consulta, com o cache frio) ≤ 100 ms ✅. 77/77 acharam entrada.
- Primeira versão media 33 s de preparação: 107 mil registros no IndexedDB (índice com chave de 2
  caracteres). Índice em blocos ordenados: 4,3 mil registros. Blocos de 256 entradas espalhavam
  homófonos (こう: 51 entradas em 34 blocos, 100 ms); ordenar pela leitura + blocos de 64 resolveu.
- PC pelo bucket (Chrome, dev, logado; 2026-10-20): `atual.json` lido; download 15,9 MB em 2,4 s;
  preparação 3,2 s; tokenizador 18,0 MB da rede, pronto em 2,8 s; 77 consultas: média 6 ms, p95 12 ms,
  máx 29–40 ms, 77/77 com entrada; espaço do site 33 MB. ✅
- Falta (👤): medir na PWA do iPhone (depois da Vercel, V1.7). No iPhone, atenção à memória: wasm
  (~140 MB no Node) + IndexedDB.

## R4 · Casamento texto ↔ Anki (2026-10-20)

- Rodar (em apps/web, Anki aberto): `$env:MEDIR_CASAMENTO="<livro.epub>"; npx vitest run casamento.medicao`
  (`MEDIR_SAIDA=<arquivo.json>` grava as listas completas). ~40 s no PC.
- Livro: また、同じ夢を見ていた (152 mil caracteres, 86.947 pedaços; 53.616 de gramática, 33.331 de
  conteúdo). Testes de regra: 23 em `casamento.test.ts`. ✅
- Texto → JMdict: **97,5%** dos pedaços de conteúdo acham entrada; 2,5% sem entrada, quase tudo nome
  próprio (桐生 ×455, 荻原, 小柳, なっちゃん), onomatopeia e grafia mista (立ちあがる, 生みだす). ✅
- Anki → JMdict: 1514 Cards, 1502 pares (Word, Word Reading), **0 sem entrada**; 17 ambíguos (mesma
  escrita e leitura em 2+ entradas: これ, それ, 三 さん, 妻, パン…), ligados a todas. ✅
- Texto ↔ Anki: 3021 Palavras distintas no livro; **1086 (36%) caem num Card**, 24.442 ocorrências
  (73% dos pedaços de conteúdo). Pela escrita seriam 1068: o JMdict ganha 48 (ない = 無い ×203, なん = 何,
  子ども = 子供, たくさん = 沢山, かける = 掛ける, 走れる = 走る…) e perde 30, quase todas sufixo ou
  contador com outra leitura e outra entrada (人 にん ×71, 日 にち, 中 ちゅう, 後 ご), que de fato são
  outra entrada do JMdict.
- Só em kana: 36% dos pedaços casados; 177 Palavras só em kana caem num Card.
- Homófonos em kana: 22,6% dos pedaços casados têm mais de uma entrada candidata e ficam com a mais
  frequente. Em 22 Palavras outra candidata está no Anki (さ → 差, え → 絵, いや → 嫌, こ → 子): quase
  sempre a escolhida está certa (interjeição, pedaço de palavra); não usar "qualquer candidata".
  Erro conhecido: なれる (potencial de なる) cai em 慣れる.
- Primeira rodada (antes dos ajustes): Card em kana ligava todas as entradas da leitura (さん → 12,
  incluindo 三; こう → 51); só pela escrita, なる ×347 deixava de casar (o texto escolhe 成る). Potencial
  (会える, 書ける) sem entrada; お ×475 e せる (de させる) ×73 contavam como palavra.
- 16 Palavras (171 ocorrências) caem na mesma entrada de um Card com **outra leitura**:
  皆 みな × みんな ×66, じゃあ × じゃ ×40, こっち × こちら, とっても × とても, どっち, あんまり,
  入り口 いりくち (leitura errada do IPADIC), 日本 にっぽん, 一言 いちげん (idem). Quase todas são a mesma
  palavra; falsas: しかして × そして, せる × 迫る (×1). Decidido no ADR 0013: casa pela entrada com
  qualquer leitura. Com ele: **1102 Palavras** do livro no Anki (1086 pela regra antiga), 24.613
  ocorrências (73,8% do conteúdo); pela escrita seriam 1068 (JMdict ganha 60, perde 26).

## R5 · Edge Function `gemini` (2026-10-20)

- Testes de regra: 41 (WAV, corte de silêncio, nomes, pedidos, reserva, acesso, conferência, cadeia). ✅
- Primeira rodada das 30: todas recusadas pelo gateway. Os tokens do Auth são ES256 (chaves de
  assinatura novas) e o `verify_jwt` do gateway só aceita os antigos (HS256). Corrigido:
  `verify_jwt = false` em `[functions.gemini]` do config.toml; a função confere o login com
  `auth.getUser`. Toda função nova deste projeto precisa do mesmo.
- Recusa (chamada real, depois da correção): sem token, chave pública sem usuário e JWT falso → 401
  `sem login` da própria função. A recusa de outro usuário logado (403) só pelo teste unitário: o cadastro está desligado. ✅
- 30 cartas: `dicts/r5/cartas.json` (fora do git) com palavras do また、同じ夢を見ていた, várias de leitura
  ambígua (辛い つらい, 開く あく, 風 ふう, 上手い うまい, 一日 いちにち, 明日 あした, 何度, 下手 へた).
  Preços de `dicts/r5/precos.json` (US$/1M tokens, tabela de out/2026).
- Rodada 1 (2026-10-21, voz da palavra com a instrução no texto): 30/30 geradas, 14 s por carta. A voz da
  palavra **lia a instrução em inglês** ("Say this Japanese word, pronounced...", ~4 s, 190 KB). Vozes das
  frases ótimas (6,0 s e 282 KB em média). Texto: US$ 0,0024 por carta (765 tokens); voz da frase US$ 0,0014.
  Muitas chamadas caíram no modelo de reserva `flash-lite-tts` (limite de frequência do principal).
- Comparação da voz da palavra (20 palavras: 11 de leitura ambígua do livro + 橋/箸/端, 雨/飴, 神/紙, 柿/牡蠣;
  conferência = o modelo de texto ouve e escreve em hiragana):
  kanji puro 14/20 (方, 橋, 端, 神, 風 **lidos em chinês**: fang, qiao, duan, shen, feng);
  kanji + dica de leitura na anotação de estilo (API Interactions) 17/20 (ignorou a dica em 方 かた,
  明日 あす, 風 ふ; nunca chinês); só kana 18/20 (風 e 橋 provavelmente erro da conferência). No ouvido do
  Igor, a dica muda o acento entre os pares e parece certo; a kana não tem como saber o acento.
  ~0,6 s e ~30 KB por voz de palavra.
- Decisão (custo-benefício): cadeia dica → conferência → kana → marca `confira` (`word_audio_check`).
  Voz da palavra: US$ 0,00064 por carta (só kana: 0,00022); total ~US$ 0,0045 por carta (+10%), ~US$ 2,7/mês
  a 20 cartas/dia. ~4,3 chamadas por carta: teto de 300 ≈ 70 cartas/dia. Storage: ~31 MB por 100 cartas.
- Para o V1.5: mostrar a marca `confira` na fila (ouvir, "Texto para a voz", "Refazer áudio";
  `refazer: [audio]` limpa a marca). Para o V1.6: o .apkg de 100 cartas fica perto de 31 MB.
- Rodada final (2026-10-21, com a cadeia; 11 cartas de uma rodada que bateu no teto + 19 com
  `--continuar`): 30/30 geradas. Voz da palavra: **dica 27, kana 3, confira 0** (a dica errou 方 → ほ,
  風 → かぜ, 寂しい → さみしい; a kana acertou as três). Áudio: palavra 36 KB (0,8 s), frase 279 KB (5,9 s);
  **30,7 MB por 100 cartas**. Tokens: texto 671, voz da palavra 203 (com a conferência), voz da frase 180.
  **US$ 0,00375 por carta** (US$ 0,38 por 100). 16 s por carta. Veredito do Igor: significados,
  traduções e vozes bons ("não acho que dê para ficar melhor"). ✅
- Teto: subiu para 2000 só durante os testes; de volta a 300.

## Furigana automático (V3.1, 2026-10-21)

As 30 frases das cartas do R5 (`dicts/r5/cartas.json`, de また、同じ夢を見ていた), com o JMdict
inteiro, pelo `gerado.medicao.test.ts`. **202 palavras com furigana; 197 certas (97,5%) antes das
regras de reserva; 25 das 30 frases sem nenhum erro.** Os 5 erros eram todos palpites do IPADIC em
homógrafos; o JmdictFurigana não errou nenhum, e nenhuma palavra ficou sem leitura.

| Palavra no texto | Saiu   | Certo | Causa                     | Regra de reserva                        |
| ---------------- | ------ | ----- | ------------------------- | --------------------------------------- |
| 私の行っている   | おこな | い    | tokenizador (行う × 行く) | 行っ é sempre de 行く                   |
| クリーム色       | しょく | いろ  | tokenizador (sufixo)      | 色 sozinho é いろ                       |
| 知った風な       | かぜ   | ふう  | homógrafo                 | 風 entre verbo/こんな e な/に é ふう    |
| 眠った後に       | のち   | あと  | homógrafo                 | 後 lido のち vira あと (その後 ご fica) |
| 他の先生         | た     | ほか  | homógrafo                 | 他 sozinho é ほか                       |

Com as regras, 202/202 nestas frases, mas elas foram ajustadas em cima delas: a taxa que vale como
estimativa é a de antes (97,5%). Também conferidos: 一日 いちにち, 何度 なんど (regra do 何), 明日
あした, その後 ご, 下げ さ, 上手く うまく. Rodar de novo (em apps/web):
`$env:MEDIR_FURIGANA="<arquivo>"; npx vitest run gerado.medicao`.

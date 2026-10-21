# Furigana gerado por cima do texto, calculado no aparelho

O furigana gerado (v3) é calculado no aparelho, parágrafo por parágrafo, só perto da tela, com o tokenizador e o JmdictFurigana que já estão no IndexedDB. Ele aparece como um `<span class="dk-fg" data-r="leitura">` em volta dos kanji, com a leitura num `::after` posicionado por cima (à direita no texto vertical). Não usamos `<ruby>`/`<rt>`, e o HTML do livro guardado pelo ttu não muda. O cache fica em memória, pelo texto do parágrafo: dura enquanto o livro está aberto e cobre a troca de seção no modo de páginas. O estado das palavras (adaptativo) vem do mesmo casamento pedaço → entrada do destaque (ADR 0008, 0013), por uma classe em cada `span`. Mudar o hub troca só as classes, sem recalcular nada.

Por que não `<ruby>`: um `<rt>` com a leitura alarga a base quando a leitura é mais longa que o kanji (承 うけたまわ). Isso muda a quebra de linha e, no modo de páginas, empurra texto para outra página no meio da leitura. O `::after` absoluto não ocupa lugar: a altura de linha do ttu (2,15) já deixa espaço acima do texto, e as páginas não se mexem quando o furigana liga, desliga ou esconde uma palavra. A leitura também não entra no texto do DOM, então a contagem de caracteres do ttu (`getParagraphNodes` + `getCharacterCount`), o Alcance, a Frase da carta e o copiar continuam vendo só o texto do livro.

Por que não gerar no HTML do livro (na importação, ou antes de o ttu desenhar): seria preciso tokenizar o livro inteiro antes de abrir, e trocar de modo obrigaria o ttu a redesenhar o livro (perdendo a posição). Pelo parágrafo, o custo é o mesmo do destaque, que já tokeniza o que está perto da tela.

## Consequences

- Envolver um trecho num `span` divide o nó de texto. O nó original fica sempre no DOM (com o começo do trecho, ou dentro do `span`), para que as referências do ttu aos nós continuem conectadas. O cache de parágrafos do toque (`texto-do-dom.ts`) é esquecido para o parágrafo que mudou.
- Leitura mais longa que a base pode encostar na leitura vizinha. É raro, e aceito em troca de não mexer no layout.
- Furigana que o EPUB já traz (`<ruby>`) é respeitado: o gerado não cobre esses trechos.
- Nada é salvo nem sincronizado. Abrir o livro de novo recalcula o que está na tela (custa o mesmo que o destaque).

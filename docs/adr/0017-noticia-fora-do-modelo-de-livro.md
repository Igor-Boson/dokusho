# Notícia fora do modelo de Livro

A Notícia não vira Livro do ttu (nem EPUB). Ela tem tabelas, telas e leitura próprias, e o toque na
palavra, o painel, o destaque, o furigana e a criação de Carta saem do leitor de livros para um
componente que recebe a raiz do texto e serve aos dois.

Gerar um EPUB por Notícia (ou por Edição do dia) e importar na biblioteca seria o caminho mais curto,
porque o leitor já funcionaria. Mas o sincronizador sobe todo livro do ttu para o bucket `epubs`, sem
filtro; o livro apareceria na Biblioteca, no "Continuar lendo" e nas listas de cobertura; e o ttu
identifica livro pelo título. Seriam centenas de livros de 300 caracteres por ano misturados aos de
verdade, com um filtro de exclusão espalhado por meia dúzia de lugares.

## Consequences

- Carta criada numa Notícia tem `book_id` = `nhk:<id da notícia>` e etiqueta `dokusho::NHK_Easy`
  (docs/CARDS.md).
- O tempo de leitura das Notícias não passa pelo contador do ttu; precisa de contagem própria para
  entrar no Início.
- Cobertura e palavras vistas continuam sendo só dos Livros.

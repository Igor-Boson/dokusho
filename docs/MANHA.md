Temporário: apagar depois de executar os passos. O que for permanente já está em PROGRESSO.md.

# Testar a v2 (branch `v2-autonomo`, ainda fora do ar)

## O que testar primeiro, em ordem

1. Primeira Sincronização do Anki, no Chrome do PC, com o app local (passos 1 a 8).
2. Destaque, painel e "Já sei" no leitor (passos 9 a 12).
3. Cobertura e lista de desconhecidas (passos 13 e 14).
4. Aba Palavras do Início e importação pela frequência (passos 15 a 17).
5. Publicar e ver o critério da v2 no iPad (passos 18 a 22).

## Passo a passo

1. Feche todas as abas e janelas do Dokusho no Chrome (a de produção e a de localhost). A v2
   atualiza o banco local, e uma aba antiga aberta trava essa atualização.
2. Abra o Anki do PC e deixe aberto.
3. No PowerShell, na pasta do projeto, confira que está na branch da v2 (deve mostrar
   `v2-autonomo`):

   ```
   git branch --show-current
   ```

4. Rode o app local e espere aparecer `Local: http://localhost:5173/`:

   ```
   pnpm dev
   ```

5. No Chrome, abra http://localhost:5173/vocabulario. Se pedir, entre na conta (Início › ⚙ ›
   Data › Conta). Deve aparecer o cartão **Anki** com o botão **Sincronizar Anki**.
6. Clique em **Sincronizar Anki**. Se pedir o dicionário, aceite o download (~32 MB). Se o
   Chrome pedir permissão de rede local, permita.
7. Espere os passos (AnkiWeb, Cards, dicionário…). Leva perto de 1 minuto. No ensaio só de
   leitura que fiz, o resultado foi: **1515 Cards, 1503 Palavras (0 sem entrada)**, e no topo do
   cartão **996 conhecidas · 507 aprendendo** (os seus números de hoje podem mudar um pouco).
8. Me devolva a linha do resultado e os dois números do topo. Se der erro, me devolva a mensagem.
9. Abra a Biblioteca e o livro また、同じ夢を見ていた. As palavras desconhecidas devem ter fundo azul
   claro e as que você está aprendendo, sublinhado âmbar. As conhecidas ficam sem nada.
10. Toque numa palavra azul: o painel mostra **desconhecida** e o botão **Já sei**. Toque em **Já
    sei**: o estado vira **conhecida · já sei** e o azul some do texto. Toque em **Desfazer "Já
    sei"** para voltar.
11. Toque em みんな ou 皆 (se aparecer): o painel deve mostrar o estado do Anki e, quando a leitura do
    livro for outra, **no Anki como みんな**. O botão fica **No Anki**.
12. Toque numa palavra que já está no Anki e em **Criar carta**: deve pedir confirmação ("já está no
    Anki"). Toque em **Cancelar**.
13. Role o texto um pouco para cima para mostrar a barra do topo: depois de uns 15 s com o livro
    aberto, ela mostra **· cobertura NN%**.
14. Menu **⋯** › **Palavras do livro**: deve abrir a cobertura e a lista das desconhecidas, da mais
    frequente no livro para a menos. Me devolva a porcentagem.
15. Na navegação, **Início** › aba **Palavras**: o total de conhecidas e, embaixo, **Cobertura por
    livro**.
16. **Vocabulário** › "Já sei" pela frequência: deixe 3000 (ou outro número) e clique em **Ver
    quantas palavras**. Só depois, se quiser, clique em **Marcar N palavras**. Dá para desfazer na
    mesma tela.
17. Se algo de 9 a 16 estiver errado ou feio, me descreva (ou mande print) antes de publicar.
18. Pare o app local no PowerShell com `Ctrl+C`.
19. No GitHub, abra https://github.com/Igor-Boson/dokusho/compare/main...v2-autonomo, clique em
    **Create pull request** e depois em **Merge pull request** › **Confirm merge**. A Vercel publica
    sozinha.
20. No iPad, feche o Dokusho (deslize para cima no seletor de apps) e abra de novo. Quando aparecer
    **Nova versão do app · Atualizar**, toque em **Atualizar**.
21. Ainda no iPad, abra um livro: deve mostrar a cobertura em % na barra do topo, e uma palavra
    conhecida no Anki deve aparecer sem destaque (as desconhecidas em azul). É o critério da v2.
22. Me devolva se o passo 21 deu certo.

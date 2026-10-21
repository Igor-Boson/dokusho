# Progresso

Estado e pendências. Curto: o próximo chat lê isto primeiro. O histórico fica em docs/historico/
(DECISOES.md, TESTES-DE-RISCO.md, ENTREVISTA.md) e o mapa do código em docs/ARQUITETURA.md.

## Estado

**v1 pronta** (2026-10-21), no ar em https://dokusho-kappa.vercel.app. **v2 pronta** e no ar
(PR #5, 2026-10-21). Decisões marcadas "(autônomo, revisar)" em docs/historico/DECISOES.md.
**V3.1 no ar** (PRs #6 e #7, 2026-10-21), conferido pelo Igor no iPhone.
Próximo: V3.2.

| Item | Status  | Data       | Observação                                                                  |
| ---- | ------- | ---------- | --------------------------------------------------------------------------- |
| S1   | feito   | 2026-10-20 | ttu roda; vitest; supabase init + link                                      |
| S2   | feito   | 2026-10-21 | schema, login, cadastro desligado; rls_check conferido no SQL Editor        |
| D1   | feito   | 2026-10-20 | telas aprovadas; regra dos toques B; protótipo no branch prototype/d1-telas |
| R1   | feito\* | 2026-10-21 | guid e .apkg iguais ao genanki; Anki do PC ok; AnkiMobile dispensado        |
| R2   | feito   | 2026-10-21 | AnkiConnect pelo Chrome; URL de produção no `webCorsOriginList`             |
| R3   | feito\* | 2026-10-20 | lindera; 32 MB; PC dentro das metas; medida no iPhone dispensada            |
| R4   | feito   | 2026-10-20 | 97,5% do texto acha entrada; 0 Cards sem entrada                            |
| R5   | feito   | 2026-10-21 | 30 cartas aprovadas; US$ 0,0038/carta; alerta de orçamento criado           |
| V1.1 | feito\* | 2026-10-21 | sincronização por linha (ADR 0014)                                          |
| V1.2 | feito   | 2026-10-21 | 103/103 formas com o JMdict inteiro                                         |
| V1.3 | feito\* | 2026-10-21 | toque, painel, carta local, barra verde                                     |
| V1.4 | feito   | 2026-10-21 | Início somando os aparelhos; números conferidos no PC                       |
| V1.5 | feito   | 2026-10-21 | 10 cartas geradas no PC                                                     |
| V1.6 | feito   | 2026-10-21 | .apkg importa no Anki do PC e reimportar não duplica                        |
| V1.7 | feito   | 2026-10-21 | PWA, backup, aviso de servidor pausado, deploy (só o `main` publica)        |
| V2.1 | feito   | 2026-10-21 | 1ª sincronização real: 1515 Cards, 1503 Palavras, 0 sem entrada, 1 Lote     |
| V2.2 | feito   | 2026-10-21 | destaque, painel e "Já sei" conferidos no PC pelo Igor                      |
| V2.3 | feito   | 2026-10-21 | cobertura no leitor, Biblioteca e Vocabulário; desconhecidas por frequência |
| V2.4 | feito   | 2026-10-21 | lista do hub na tela Vocabulário; aba Palavras no Início                    |
| V3.1 | feito   | 2026-10-21 | furigana gerado e adaptativo (ADR 0015); 97,5% certo; ok no iPhone          |

\* Testes em aparelho dispensados pelo Igor, cobertos só pelos testes automáticos (ver abaixo).

## Não testado em aparelho (v1)

- Dois aparelhos: livro do PC no iPad no mesmo ponto, soma do tempo no mesmo dia, apagar livro
  (coberto pelo `sincronizador.test.ts`, com dois aparelhos falsos).
- iPhone: 30 toques (V1.3), velocidade do dicionário (R3/V1.2: Configurações › Data › Dicionário ›
  "Medir velocidade"), AnkiMobile e Lote de 100 cartas (R1: Fila › "Exportar .apkg" →
  "Compartilhar com o Anki").
- A navegação 15% mais alta e o toque no espaço livre que tira o realce foram testados só no
  navegador em tamanho de celular.

Se algo disso falhar no uso, anote aqui e abra um chat de correção.

## Pendências

- [ ] Revisar as decisões "(autônomo, revisar)" da v2 e do V3.1 em docs/historico/DECISOES.md
- Conhecido: na primeira abertura da v2, uma aba ou janela antiga do Dokusho (v1) aberta trava a
  atualização do banco local; o app avisa e é só fechá-la.

Lembrete: o teto do Gemini está em 300 (~70 cartas por dia); se bater,
`npx supabase secrets set GEMINI_TETO_DIARIO=<n>`.

## Sem decisão (da entrevista de 20/10)

- Modo de leitura no PC (o toque e o painel funcionam nos dois; a barra do topo foi resolvida no V1.3).
- Números: valor do alerta, corte da frase, intervalo do marcador,
  prazo do áudio.
- Não discutidos: detalhes da tela inicial (início da semana, virada do dia, fuso em viagem), metas,
  restaurar backup (hoje mescla), fontes e acessibilidade.

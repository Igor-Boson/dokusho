# Dokusho

Leitor de EPUB japonês para uso pessoal: lê no iPhone, iPad e PC com o mesmo ponto de leitura,
mostra o dicionário ao tocar numa palavra e transforma as palavras escolhidas em cartas do Anki
(significado e tradução da frase em português e áudio pelo Gemini), exportadas em .apkg.

É um fork do [ッツ Ebook Reader](https://github.com/ttu-ttu/ebook-reader) (SvelteKit), com
sincronização pelo Supabase. Projeto de um usuário só: o cadastro fica desligado e a Edge Function
aceita apenas o dono.

## Documentos

| Arquivo                                      | Para quê                                        |
| -------------------------------------------- | ----------------------------------------------- |
| [docs/ESCOPO.md](docs/ESCOPO.md)             | Especificação: o que o app faz, roadmap, riscos |
| [docs/PROGRESSO.md](docs/PROGRESSO.md)       | Estado atual e pendências                       |
| [docs/FASES.md](docs/FASES.md)               | Roteiro de construção, um item por chat         |
| [docs/ARQUITETURA.md](docs/ARQUITETURA.md)   | Mapa do código                                  |
| [docs/CARDS.md](docs/CARDS.md)               | Formato dos cards do Anki (fonte única)         |
| [docs/ANKI-CONNECT.md](docs/ANKI-CONNECT.md) | Configuração do AnkiConnect no PC               |
| [docs/adr/](docs/adr/)                       | Decisões com motivo                             |
| [docs/historico/](docs/historico/)           | Decisões datadas, testes de risco, entrevista   |
| [GLOSSARY.md](GLOSSARY.md)                   | Termos do domínio                               |
| [CLAUDE.md](CLAUDE.md)                       | Stack, comandos e regras fixas                  |

## Rodar

Na raiz, com Node 24 e pnpm via corepack:

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm dev
```

Testes: `pnpm test`. Tipos: `cd apps/web && pnpm check`. Build: `pnpm build`. O app precisa de
`apps/web/.env` com `PUBLIC_SUPABASE_URL` e `PUBLIC_SUPABASE_ANON_KEY` (modelo em
`apps/web/.env.example`); sem login, funciona só no aparelho.

## Licença

BSD 3-Clause, herdada do ttu (ver [LICENSE](LICENSE)). A busca e a deflexão do dicionário são
implementações próprias (o Yomitan é GPL). JMdict e JmdictFurigana são CC BY-SA.

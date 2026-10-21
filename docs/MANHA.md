Temporário: apagar depois de executar os passos. O que for permanente já está em PROGRESSO.md.

# Deploy da v1

Feito: PR #1 juntado no `main`; site no ar em https://dokusho-kappa.vercel.app. Falta, um passo por
vez:

1. No GitHub, abra https://github.com/Igor-Boson/dokusho/compare/main...fix/vercel-so-main (confira
   no topo: **base repository: Igor-Boson/dokusho**, **base: main**), clique em **Create pull
   request** e depois em **Merge pull request** › **Confirm merge**. Isso desliga os previews: daqui
   para frente só o `main` publica (no lugar do antigo passo 6, que não existe mais no painel).
2. Supabase › seu projeto › **Authentication › URL Configuration**: **Site URL** =
   `https://dokusho-kappa.vercel.app`. **Save**.
3. Anki do PC › **Ferramentas › Complementos › AnkiConnect › Configurar**: apague tudo e cole este
   texto inteiro (cada URL entre aspas, separadas por vírgula). **OK** e reinicie o Anki.

   ```json
   {
     "apiKey": null,
     "apiLogPath": null,
     "ignoreOriginList": [],
     "webBindAddress": "127.0.0.1",
     "webBindPort": 8765,
     "webCorsOriginList": ["http://localhost:5173", "https://dokusho-kappa.vercel.app"]
   }
   ```

4. No iPhone, Safari: abra https://dokusho-kappa.vercel.app, **Compartilhar › Adicionar à Tela de
   Início**. Abra pelo ícone e entre na conta. Deve abrir na tela Início, com o livro do PC na
   Biblioteca (ícone de nuvem).
5. Quando terminar os testes com o Gemini, volte o teto para 300 (PowerShell, na pasta do projeto):

   ```
   npx supabase secrets set GEMINI_TETO_DIARIO=300
   ```

6. Google Cloud › **Billing › Budgets & alerts › Create budget**: alerta de US$ 5 por mês no projeto
   da GEMINI_API_KEY.
7. Supabase › **SQL Editor**: cole o conteúdo de `supabase/tests/rls_check.sql`, **Run**; deve dar
   dono = 1 e outro = 0.

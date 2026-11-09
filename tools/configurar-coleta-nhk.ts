// Configura a Coleta diária das Notícias (ADR 0016). Quem roda é o usuário, na raiz:
//
//   node tools/configurar-coleta-nhk.ts
//
// Cria um token aleatório, grava como secret NHK_TOKEN_COLETA da Edge Function nhk e guarda no
// Vault do banco o endereço da função e o mesmo token (nhk_coleta_url, nhk_coleta_token), que o
// job do pg_cron usa. O token nunca aparece na tela. Rodar de novo troca o token.

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

const env = readFileSync('apps/web/.env', 'utf8');
const url = /^PUBLIC_SUPABASE_URL=["']?([^"'\r\n]+)/m.exec(env)?.[1]?.trim();
if (!url || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
  console.error('Não achei PUBLIC_SUPABASE_URL (https://<ref>.supabase.co) em apps/web/.env.');
  process.exit(1);
}
const token = randomBytes(32).toString('hex');
const funcao = `${url}/functions/v1/nhk`;

function supabase(args: string[]) {
  try {
    execFileSync('npx', ['supabase', ...args], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    const saida = String((e as { stderr?: Buffer }).stderr ?? e).replaceAll(token, '<token>');
    console.error(saida);
    process.exit(1);
  }
}

console.log('1/2 Gravando o secret NHK_TOKEN_COLETA da função nhk...');
supabase(['secrets', 'set', `NHK_TOKEN_COLETA=${token}`]);

console.log('2/2 Guardando o endereço da função e o token no Vault...');
const guardar = (nome: string, valor: string) => `
  perform vault.update_secret(id, '${valor}') from vault.secrets where name = '${nome}';
  if not found then perform vault.create_secret('${valor}', '${nome}'); end if;`;
supabase([
  'db',
  'query',
  '--linked',
  `"do $$ begin ${guardar('nhk_coleta_url', funcao)} ${guardar('nhk_coleta_token', token)} end $$;"`
]);

console.log('Pronto. A Coleta roda todo dia às 8h45 (Brasília).');

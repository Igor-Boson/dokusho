// Edge Function nhk (ADR 0016): a Coleta das Notícias do NHK NEWS WEB EASY e as fotos.
//
//   { acao: 'coletar' }        → { novas, baixadas, falhas } ou { pulou: true } ou { erro }
//   { acao: 'fotos', ids }     → { fotos: { [id]: { tipo, dados (base64) } | { erro } } }
//
// Quem chama: o pg_cron uma vez por dia (cabeçalho x-coleta com o secret NHK_TOKEN_COLETA) ou o
// app logado como ALLOWED_USER_ID. No máximo 1 pedido por segundo à NHK, com novas tentativas.
// A lógica de leitura fica em nhk.ts (sem imports, testada pelo vitest).

import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import {
  ENDERECOS,
  ErroNhk,
  cookiesPara,
  enderecoDaNhk,
  fotoPedeLogin,
  guardarCookies,
  idValido,
  lerArtigo,
  lerLista,
  quaisBaixar,
  PAGINA_EASY,
  type ItemDaLista,
  type Pote
} from './nhk.ts';

// Artigos baixados por Coleta (o resto do estoque vem nas próximas, das mais novas para trás).
const POR_COLETA = 20;
// O app só dispara outra Coleta depois de 1 h da última tentativa.
const INTERVALO_DO_APP = 60 * 60 * 1000;
const FOTOS_POR_PEDIDO = 10;
const FOTO_MAXIMA = 4 * 1024 * 1024;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/130.0.0.0 Safari/537.36';

function chaveServico() {
  const legada = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legada) return legada;
  const novas = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
  const chave = novas.default ?? Object.values(novas)[0];
  if (!chave) throw new Error('Sem chave de serviço no ambiente da função');
  return chave as string;
}

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, chaveServico(), {
  auth: { persistSession: false }
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function responder(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

const limpo = (s: string | undefined) => (s ?? '').trim().replace(/^["']|["']$/g, '');

function iguais(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

const motivo = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

// ---------------------------------------------------------------------------------------------
// Pedidos à NHK: 1 por segundo, redirecionamento à mão (para guardar os cookies de cada passo).

let ultimoPedido = 0;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function aguardarVez() {
  const espera = ultimoPedido + 1000 - Date.now();
  if (espera > 0) await dormir(espera);
  ultimoPedido = Date.now();
}

async function buscar(url: string, pote: Pote) {
  const cabecalhos: Record<string, string> = {
    'User-Agent': UA,
    Referer: PAGINA_EASY,
    'Accept-Language': 'ja,en;q=0.8'
  };
  const cookie = cookiesPara(pote, url);
  if (cookie) cabecalhos.Cookie = cookie;
  for (let tentativa = 1; ; tentativa++) {
    await aguardarVez();
    try {
      const r = await fetch(url, { headers: cabecalhos, redirect: 'manual' });
      if ((r.status === 429 || r.status >= 500) && tentativa < 3) {
        await r.body?.cancel();
        await dormir(2000 * tentativa ** 2);
        continue;
      }
      return r;
    } catch (e) {
      if (tentativa >= 3) throw new ErroNhk('rede', motivo(e));
      await dormir(2000 * tentativa ** 2);
    }
  }
}

async function pedir(pote: Pote, inicio: string) {
  let url = inicio;
  for (let salto = 0; salto < 10; salto++) {
    if (!enderecoDaNhk(url)) throw new ErroNhk('rede', `redirecionado para fora da NHK: ${url}`);
    const r = await buscar(url, pote);
    guardarCookies(pote, url, r.headers.getSetCookie());
    const destino = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && destino) {
      await r.body?.cancel();
      url = new URL(destino, url).href;
      continue;
    }
    return r;
  }
  throw new ErroNhk('login', 'redirecionamentos demais');
}

async function entrar() {
  const pote: Pote = new Map();
  const r = await pedir(pote, ENDERECOS.entrar);
  await r.body?.cancel();
  if (!r.ok) throw new ErroNhk('login', `status ${r.status}`);
  return pote;
}

async function baixarLista(pote: Pote) {
  for (const url of ENDERECOS.listas) {
    const r = await pedir(pote, url);
    if (r.status === 404) {
      await r.body?.cancel();
      continue;
    }
    const json = await r.json().catch(() => {
      throw new ErroNhk('lista', `${url}: não veio JSON (status ${r.status})`);
    });
    return lerLista(json);
  }
  throw new ErroNhk('lista', 'news-list.json e top-list.json não existem mais');
}

// ---------------------------------------------------------------------------------------------
// Coleta

async function gravarEstado(usuario: string, campos: Record<string, unknown>) {
  const { error } = await supabase
    .from('news_collection')
    .upsert({ user_id: usuario, ...campos, modified_at: new Date().toISOString() });
  if (error) throw new Error(`news_collection: ${error.message}`);
}

// news_id → tem texto, de todas as Notícias já guardadas (em páginas de 1000).
async function guardadas(usuario: string) {
  const mapa = new Map<string, boolean>();
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from('news_articles')
      .select('news_id, fetched_at')
      .eq('user_id', usuario)
      .order('news_id')
      .range(de, de + 999);
    if (error) throw new Error(`news_articles: ${error.message}`);
    for (const linha of data) mapa.set(linha.news_id, linha.fetched_at !== null);
    if (data.length < 1000) return mapa;
  }
}

async function inserirNovas(usuario: string, novas: ItemDaLista[]) {
  const agora = new Date().toISOString();
  for (let i = 0; i < novas.length; i += 200) {
    const { error } = await supabase.from('news_articles').upsert(
      novas.slice(i, i + 200).map((n) => ({
        user_id: usuario,
        news_id: n.id,
        published_at: n.publicadaEm,
        title: n.titulo,
        title_ruby: n.tituloRuby,
        image_url: n.foto,
        voice_uri: n.voz,
        modified_at: agora
      })),
      { onConflict: 'user_id,news_id', ignoreDuplicates: true }
    );
    if (error) throw new Error(`news_articles: ${error.message}`);
  }
}

async function coletar(usuario: string, doApp: boolean) {
  const { data: estado } = await supabase
    .from('news_collection')
    .select('last_attempt_at')
    .eq('user_id', usuario)
    .maybeSingle();
  const ultima = estado?.last_attempt_at ? Date.parse(estado.last_attempt_at) : 0;
  if (doApp && Date.now() - ultima < INTERVALO_DO_APP) return { pulou: true };

  await gravarEstado(usuario, { last_attempt_at: new Date().toISOString() });
  try {
    let pote = await entrar();
    const lista = await baixarLista(pote);
    const ja = await guardadas(usuario);
    const novas = lista.filter((i) => !ja.has(i.id));
    await inserirNovas(usuario, novas);

    const comTexto = new Set([...ja].filter(([, tem]) => tem).map(([id]) => id));
    const porId = new Map(lista.map((i) => [i.id, i]));
    const falhas: string[] = [];
    let baixadas = 0;
    let entrouDeNovo = false;
    for (const id of quaisBaixar(lista, comTexto, POR_COLETA)) {
      for (;;) {
        try {
          const r = await pedir(pote, ENDERECOS.artigo(id));
          if (!r.ok) {
            await r.body?.cancel();
            throw new ErroNhk('artigo', `status ${r.status}`);
          }
          const artigo = lerArtigo(await r.text(), id);
          const agora = new Date().toISOString();
          const { error } = await supabase
            .from('news_articles')
            .update({
              body_html: artigo.corpo,
              body_chars: artigo.caracteres,
              image_url: porId.get(id)?.foto ?? artigo.foto,
              fetched_at: agora,
              modified_at: agora
            })
            .eq('user_id', usuario)
            .eq('news_id', id);
          if (error) throw new Error(`news_articles: ${error.message}`);
          baixadas++;
          break;
        } catch (e) {
          // Os cookies venceram no meio: entra de novo uma vez e tenta o mesmo artigo.
          if (e instanceof ErroNhk && e.etapa === 'consentimento' && !entrouDeNovo) {
            entrouDeNovo = true;
            pote = await entrar();
            continue;
          }
          falhas.push(`${id}: ${motivo(e)}`);
          break;
        }
      }
      if (falhas.length >= 3 && baixadas === 0) throw new ErroNhk('artigo', falhas[0]);
    }

    const total = ja.size + novas.length;
    await gravarEstado(usuario, {
      last_success_at: new Date().toISOString(),
      last_error: falhas.length ? `${falhas.length} artigo(s) com erro; ${falhas[0]}` : null,
      articles: total,
      with_text: comTexto.size + baixadas
    });
    return { novas: novas.length, baixadas, falhas };
  } catch (e) {
    await gravarEstado(usuario, { last_error: motivo(e) }).catch(() => {});
    return { erro: e instanceof ErroNhk ? e.etapa : 'interno', motivo: motivo(e) };
  }
}

// ---------------------------------------------------------------------------------------------
// Fotos: o app pede as da Edição do dia, reduz e guarda no aparelho. Nada fica no Storage.

function base64(bytes: Uint8Array) {
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}

async function fotos(usuario: string, pedidos: unknown) {
  const ids = (Array.isArray(pedidos) ? pedidos : [])
    .filter((id): id is string => typeof id === 'string' && idValido(id))
    .slice(0, FOTOS_POR_PEDIDO);
  if (ids.length === 0) return { fotos: {} };
  const { data, error } = await supabase
    .from('news_articles')
    .select('news_id, image_url')
    .eq('user_id', usuario)
    .in('news_id', ids);
  if (error) throw new Error(`news_articles: ${error.message}`);

  const enderecos = new Map(data.map((l) => [l.news_id as string, l.image_url as string | null]));
  const saida: Record<string, { tipo: string; dados: string } | { erro: string }> = {};
  let pote: Pote | null = null;
  for (const id of ids) {
    const url = enderecos.get(id);
    try {
      if (!url || !enderecoDaNhk(url)) throw new ErroNhk('foto', 'sem foto');
      if (fotoPedeLogin(url) && !pote) pote = await entrar();
      const r = await pedir(pote ?? new Map(), url);
      const tipo = r.headers.get('content-type') ?? '';
      if (!r.ok || !tipo.startsWith('image/')) {
        await r.body?.cancel();
        throw new ErroNhk('foto', `status ${r.status} ${tipo}`);
      }
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes.length > FOTO_MAXIMA)
        throw new ErroNhk('foto', `grande demais (${bytes.length} B)`);
      saida[id] = { tipo, dados: base64(bytes) };
    } catch (e) {
      saida[id] = { erro: motivo(e) };
    }
  }
  return { fotos: saida };
}

// ---------------------------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return responder(405, { erro: 'só POST' });

  const permitido = limpo(Deno.env.get('ALLOWED_USER_ID'));
  if (!permitido) return responder(500, { erro: 'ALLOWED_USER_ID ausente' });
  const pedido = await req.json().catch(() => ({}));

  // pg_cron: só a Coleta, com o token do Vault.
  const tokenColeta = limpo(Deno.env.get('NHK_TOKEN_COLETA'));
  if (iguais(req.headers.get('x-coleta') ?? '', tokenColeta)) {
    if (pedido.acao !== 'coletar') return responder(400, { erro: 'só coletar' });
    return responder(200, await coletar(permitido, false));
  }

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const { data: login } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
  const usuario = login.user?.id;
  if (!usuario) return responder(401, { erro: 'sem login' });
  if (usuario !== permitido) return responder(403, { erro: 'usuário não permitido' });

  try {
    if (pedido.acao === 'coletar') return responder(200, await coletar(usuario, true));
    if (pedido.acao === 'fotos') return responder(200, await fotos(usuario, pedido.ids));
    return responder(400, { erro: 'acao deve ser coletar ou fotos' });
  } catch (e) {
    return responder(500, { erro: motivo(e) });
  }
});

// Leitura do NHK NEWS WEB EASY (ADR 0016): lista de Notícias, artigo, cookies do login de quem
// está fora do Japão e a escolha do que baixar. Sem imports: roda no Deno e no vitest.
//
// O HTML que sai daqui vai para o innerHTML do app, então limparHtml é uma lista branca: só <p>,
// <ruby> e <rt>, sem atributos, com o texto escapado de novo.

export const ORIGEM = 'https://news.web.nhk';
export const PAGINA_EASY = `${ORIGEM}/news/easy/`;

// O fluxo de quem está fora do Japão (NHK ONE, desde out/2025): este endereço passa pelo aviso de
// uso com uma localização fixa de Tóquio e devolve os cookies que as listas e os artigos pedem.
export const ENDERECOS = {
  entrar:
    `${ORIGEM}/tix/build_authorize?idp=a-alaz&profileType=abroad` +
    `&redirect_uri=${encodeURIComponent(PAGINA_EASY)}` +
    '&entity=none&area=130&pref=13&jisx0402=13101&postal=1000001',
  listas: [`${PAGINA_EASY}news-list.json`, `${PAGINA_EASY}top-list.json`],
  artigo: (id: string) => `${PAGINA_EASY}${id}/${id}.html`
};

export const idValido = (id: string) => ID.test(id);

// A foto da versão fácil abre sem login; a da notícia normal pede os cookies.
export const fotoPedeLogin = (url: string) => !new URL(url).pathname.startsWith('/news/easy/ogp/');

export type Etapa = 'login' | 'lista' | 'artigo' | 'consentimento' | 'foto' | 'rede';

export class ErroNhk extends Error {
  etapa: Etapa;
  constructor(etapa: Etapa, motivo: string) {
    super(`${etapa}: ${motivo}`);
    this.etapa = etapa;
  }
}

export type ItemDaLista = {
  id: string;
  publicadaEm: string; // ISO em UTC
  titulo: string;
  tituloRuby: string;
  foto: string | null;
  voz: string | null;
};

export type Artigo = { corpo: string; caracteres: number; foto: string | null };

const ID = /^[0-9a-z]{8,40}$/;
const HORARIO_JST = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;

type Bruto = Record<string, unknown>;

const texto = (v: unknown) => (typeof v === 'string' ? v : '');

// Só https nos servidores da NHK: a Coleta busca esses endereços com os cookies do login.
export function enderecoDaNhk(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)nhk(\.jp|\.or\.jp)?$/.test(u.hostname);
  } catch {
    return false;
  }
}

function fotoDoItem(bruto: Bruto) {
  const candidatas = [
    bruto.has_news_easy_image ? texto(bruto.news_easy_image_uri) : '',
    bruto.has_news_web_image ? texto(bruto.news_web_image_uri) : ''
  ];
  return candidatas.find((url) => url && enderecoDaNhk(url)) ?? null;
}

function itemDe(bruto: unknown): ItemDaLista | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const b = bruto as Bruto;
  const id = texto(b.news_id);
  const horario = HORARIO_JST.exec(texto(b.news_prearranged_time));
  if (!ID.test(id) || !horario) return null;
  const data = new Date(`${horario[1]}T${horario[2]}+09:00`);
  if (Number.isNaN(data.getTime())) return null;
  const tituloRuby = limparHtml(texto(b.title_with_ruby) || texto(b.title));
  const titulo = texto(b.title).trim() || textoSemLeitura(tituloRuby);
  if (!titulo) return null;
  return {
    id,
    publicadaEm: data.toISOString(),
    titulo,
    tituloRuby,
    foto: fotoDoItem(b),
    voz: texto(b.news_easy_voice_uri) || null
  };
}

// top-list.json é uma lista de itens; news-list.json é [{ "AAAA-MM-DD": [itens] }].
export function lerLista(json: unknown): ItemDaLista[] {
  if (json && typeof json === 'object' && !Array.isArray(json) && 'error' in json) {
    const erro = (json as { error?: { id?: string; message?: string } }).error;
    throw new ErroNhk('login', erro?.id ?? erro?.message ?? 'erro sem motivo');
  }
  if (!Array.isArray(json)) throw new ErroNhk('lista', 'a resposta não é uma lista');
  const brutos = json.flatMap((x) =>
    x && typeof x === 'object' && !Array.isArray(x) && !('news_id' in x)
      ? Object.values(x as Bruto).flatMap((dia) => (Array.isArray(dia) ? dia : []))
      : [x]
  );
  const porId = new Map<string, ItemDaLista>();
  for (const bruto of brutos) {
    const item = itemDe(bruto);
    if (item && !porId.has(item.id)) porId.set(item.id, item);
  }
  if (porId.size === 0) throw new ErroNhk('lista', 'nenhuma Notícia reconhecida');
  return [...porId.values()].sort((a, b) => b.publicadaEm.localeCompare(a.publicadaEm));
}

// O <div> com o id dado, até o </div> que o fecha (contando os <div> de dentro).
function trechoDoDiv(html: string, id: string) {
  const abre = new RegExp(`<div\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i').exec(html);
  if (!abre) return null;
  const inicio = abre.index + abre[0].length;
  const tags = /<(\/?)div\b[^>]*>/gi;
  tags.lastIndex = inicio;
  let nivel = 1;
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    nivel += m[1] ? -1 : 1;
    if (nivel === 0) return html.slice(inicio, m.index);
  }
  return html.slice(inicio);
}

export function lerArtigo(html: string, id: string): Artigo {
  const trecho = trechoDoDiv(html, 'js-article-body');
  if (trecho === null) {
    if (html.includes('ご利用にあたって')) {
      throw new ErroNhk('consentimento', 'a NHK devolveu o aviso de uso em vez do artigo');
    }
    throw new ErroNhk('artigo', 'sem #js-article-body');
  }
  const corpo = limparHtml(trecho);
  const caracteres = textoSemLeitura(corpo).replace(/[ \t\r\n]/g, '').length;
  if (caracteres === 0) throw new ErroNhk('artigo', 'corpo vazio');

  const src = /<img\b[^>]*\bsrc=["']([^"']+)["']/i.exec(trecho)?.[1];
  let foto: string | null = null;
  if (src) {
    try {
      const url = new URL(decodificar(src), `${PAGINA_EASY}${id}/${id}.html`).href;
      if (enderecoDaNhk(url)) foto = url;
    } catch {
      foto = null;
    }
  }
  return { corpo, caracteres, foto };
}

// ---------------------------------------------------------------------------------------------
// HTML

const PERMITIDAS = new Set(['p', 'ruby', 'rt']);
const DESCARTAR_CONTEUDO = new Set(['script', 'style', 'rp', 'template', 'noscript']);

const ENTIDADES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
};

function decodificar(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (inteira, nome: string) => {
    if (nome[0] === '#') {
      const codigo =
        nome[1] === 'x' || nome[1] === 'X' ? parseInt(nome.slice(2), 16) : +nome.slice(1);
      return codigo > 0 && codigo <= 0x10ffff ? String.fromCodePoint(codigo) : '';
    }
    return ENTIDADES[nome.toLowerCase()] ?? inteira;
  });
}

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Espaço com quebra de linha é recuo do HTML; o resto vira um espaço só. O espaço japonês (U+3000)
// fica: está no texto da NHK.
function espacos(s: string) {
  return s.replace(/[ \t]*[\r\n][ \t\r\n]*/g, '').replace(/[ \t ]+/g, ' ');
}

export function limparHtml(html: string): string {
  const saida: string[] = [];
  const abertas: string[] = [];
  let descartando: string | null = null;
  let paragrafo: string[] | null = null; // texto do <p> aberto, para tirar o vazio

  const emitir = (s: string) => (paragrafo ?? saida).push(s);
  const fechar = (tag: string) => {
    while (abertas.length) {
      const topo = abertas.pop()!;
      if (topo === 'p') {
        const conteudo = paragrafo!.join('').replace(/^ +| +$/g, '');
        paragrafo = null;
        if (textoSemLeitura(conteudo).trim()) saida.push(`<p>${conteudo}</p>`);
      } else {
        emitir(`</${topo}>`);
      }
      if (topo === tag) return;
    }
  };

  const pedacos = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>|[^<]+|</g;
  for (let m = pedacos.exec(html); m; m = pedacos.exec(html)) {
    const [inteiro, barra, nomeBruto] = m;
    if (inteiro.startsWith('<!--')) continue;
    const nome = nomeBruto?.toLowerCase();

    if (descartando) {
      if (nome === descartando && barra) descartando = null;
      continue;
    }
    if (!nome) {
      const t = espacos(decodificar(inteiro));
      if (t) emitir(escapar(t));
      continue;
    }
    if (DESCARTAR_CONTEUDO.has(nome)) {
      if (!barra && !inteiro.endsWith('/>')) descartando = nome;
      continue;
    }
    if (!PERMITIDAS.has(nome)) continue;

    if (barra) {
      if (abertas.includes(nome)) fechar(nome);
      continue;
    }
    if (nome === 'p') {
      if (abertas.length) fechar(abertas[0]);
      abertas.push('p');
      paragrafo = [];
    } else if (nome === 'ruby') {
      if (abertas.includes('ruby')) fechar('ruby');
      abertas.push('ruby');
      emitir('<ruby>');
    } else if (nome === 'rt') {
      if (!abertas.includes('ruby')) continue;
      if (abertas.includes('rt')) fechar('rt');
      abertas.push('rt');
      emitir('<rt>');
    }
  }
  if (abertas.length) fechar(abertas[0]);
  return saida.join('');
}

// Texto sem as tags e sem o que está em <rt> (a leitura).
export function textoSemLeitura(html: string) {
  return decodificar(html.replace(/<rt>[\s\S]*?<\/rt>/g, '').replace(/<[^>]*>/g, ''));
}

// ---------------------------------------------------------------------------------------------
// Cookies do login (o aviso de quem acessa de fora do Japão)

export type Cookie = { valor: string; dominio: string; soHost: boolean };
export type Pote = Map<string, Cookie>; // chave: domínio|nome

export function guardarCookies(pote: Pote, url: string, setCookies: string[]): Pote {
  const host = new URL(url).hostname;
  for (const linha of setCookies) {
    const [par, ...atributos] = linha.split(';');
    const igual = par.indexOf('=');
    if (igual <= 0) continue;
    const nome = par.slice(0, igual).trim();
    const valor = par.slice(igual + 1).trim();
    let dominio = host;
    let soHost = true;
    let apagar = valor === '';
    for (const atributo of atributos) {
      const [chave, ...resto] = atributo.split('=');
      const k = chave.trim().toLowerCase();
      const v = resto.join('=').trim();
      if (k === 'domain' && v) {
        const d = v.replace(/^\./, '').toLowerCase();
        if (host === d || host.endsWith(`.${d}`)) {
          dominio = d;
          soHost = false;
        }
      }
      if (k === 'max-age' && Number(v) <= 0) apagar = true;
    }
    // Apagar vale para o cookie do mesmo nome em qualquer domínio que este host enxergue.
    for (const [chave, c] of pote) {
      if (chave.endsWith(`|${nome}`) && (c.dominio === dominio || cabe(host, c))) {
        pote.delete(chave);
      }
    }
    if (!apagar) pote.set(`${dominio}|${nome}`, { valor, dominio, soHost });
  }
  return pote;
}

function cabe(host: string, c: Cookie) {
  return c.soHost ? host === c.dominio : host === c.dominio || host.endsWith(`.${c.dominio}`);
}

export function cookiesPara(pote: Pote, url: string) {
  const host = new URL(url).hostname;
  return [...pote]
    .filter(([, c]) => cabe(host, c))
    .map(([chave, c]) => `${chave.slice(chave.indexOf('|') + 1)}=${c.valor}`)
    .join('; ');
}

// ---------------------------------------------------------------------------------------------
// Estoque

// As mais novas que ainda não têm texto, até o limite (a lista já vem do mais novo).
export function quaisBaixar(lista: ItemDaLista[], comTexto: Set<string>, limite: number) {
  return lista
    .filter((i) => !comTexto.has(i.id))
    .slice(0, limite)
    .map((i) => i.id);
}

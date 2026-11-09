/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

// Regras das Notícias (ESCOPO "Notícias da NHK Easy"; GLOSSARY › Notícias), sem banco nem tela:
// a Edição do dia, o que ela mostra, a próxima Notícia, o Histórico e quando a Coleta preocupa.

type NoticiaParaEdicao = {
  news_id: string;
  published_at: string;
  body_html: string | null;
  deleted_at: string | null;
};

type Lida = { news_id: string; read_at: string; deleted_at: string | null };

type Coleta = {
  last_attempt_at: string | null;
  last_success_at?: string | null;
  last_error?: string | null;
};

const HORA = 60 * 60 * 1000;
/** O app pede uma Coleta quando a última tentativa passou disto. */
export const COLETA_VELHA = 12 * HORA;
/** Sem Coleta boa há mais que isto, a tela avisa. */
const COLETA_PREOCUPA = 48 * HORA;

/**
 * Edição do dia: as N Notícias não lidas mais recentes que já têm texto. Como a NHK publica menos
 * que N por dia, entram as de dias anteriores. Fica fixa até a virada (quem chama grava).
 */
export function escolherEdicao<T extends NoticiaParaEdicao>(
  noticias: T[],
  lidas: Set<string>,
  n: number
) {
  return noticias
    .filter((x) => !x.deleted_at && x.body_html && !lidas.has(x.news_id))
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .slice(0, n)
    .map((x) => x.news_id);
}

export function estadoDaEdicao(edicao: string[] | undefined, lidas: Set<string>) {
  const ids = edicao ?? [];
  const pendentes = ids.filter((id) => !lidas.has(id));

  return {
    pendentes,
    lidas: ids.length - pendentes.length,
    total: ids.length,
    acabou: ids.length > 0 && pendentes.length === 0
  };
}

/** Depois de "Lida": a pendente seguinte na ordem da Edição, ou a primeira que sobrou. */
export function proximaDaEdicao(edicao: string[], lidas: Set<string>, atual: string) {
  const depois = edicao.slice(edicao.indexOf(atual) + 1);

  return depois.find((id) => !lidas.has(id)) ?? edicao.find((id) => !lidas.has(id));
}

/** Histórico de notícias: as lidas pelo dia da leitura, mais novas primeiro. */
export function historico<T extends { news_id: string }>(
  lidas: Lida[],
  noticias: Map<string, T>,
  diaDe: (iso: string) => string
) {
  const dias = new Map<string, { noticia: T; lidaEm: string }[]>();

  for (const lida of [...lidas].sort((a, b) => b.read_at.localeCompare(a.read_at))) {
    const noticia = noticias.get(lida.news_id);

    if (lida.deleted_at || !noticia) continue;

    const dia = diaDe(lida.read_at);

    if (!dias.has(dia)) dias.set(dia, []);
    dias.get(dia)!.push({ noticia, lidaEm: lida.read_at });
  }

  return [...dias].map(([dia, itens]) => ({ dia, itens }));
}

export function precisaColetar(coleta: Coleta | undefined, agora: number) {
  const ultima = coleta?.last_attempt_at ? Date.parse(coleta.last_attempt_at) : 0;

  return agora - ultima > COLETA_VELHA;
}

/**
 * Aviso da tela quando a NHK pode ter mudado: a última tentativa falhou, ou não há Coleta boa há
 * mais de 48 h. O que já foi baixado continua aparecendo.
 */
export function avisoDaColeta(coleta: Coleta | undefined, agora: number) {
  if (!coleta?.last_attempt_at) return undefined;

  const tentativa = Date.parse(coleta.last_attempt_at);
  const sucesso = coleta.last_success_at ? Date.parse(coleta.last_success_at) : 0;
  const falhou = !!coleta.last_error && sucesso < tentativa;

  if (!falhou && agora - sucesso <= COLETA_PREOCUPA) return undefined;

  return {
    motivo: falhou ? (coleta.last_error ?? undefined) : undefined,
    ultimaBoa: coleta.last_success_at ?? undefined
  };
}

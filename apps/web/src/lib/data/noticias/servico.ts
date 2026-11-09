/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { BehaviorSubject } from 'rxjs';
import { supabase } from '$lib/data/supabase/client';
import { mensagemDaFuncao } from '$lib/data/supabase/erro-da-funcao';
import { startDayHoursForTracker$ } from '$lib/data/store';
import {
  sincronizador,
  sincronizarAgora,
  sincronizarEmBreve
} from '$lib/data/supabase/sincronizacao/iniciar';
import type { LinhaNoticia } from '$lib/data/supabase/sincronizacao/regras';
import { getDateKey } from '$lib/functions/statistic-util';
import { cobertura, type PerfilDoLivro } from '$lib/data/vocabulario/perfil';
import { perfilDoTexto } from '$lib/data/vocabulario/perfis';
import { indiceDoHub } from '$lib/data/vocabulario/servico';
import { htmlDaNoticia, resumoDaCobertura } from './cobertura';
import { escolherEdicao, precisaColetar } from './edicao';

// As Notícias no app (ESCOPO "Notícias da NHK Easy"): Edição do dia, Notícia lida, a Coleta pedida
// pelo app e as preferências deste aparelho. As regras ficam em edicao.ts.

export const POR_DIA_PADRAO = 5;
const CHAVE_POR_DIA = 'dokusho-noticias-por-dia';
const CHAVE_FURIGANA = 'dokusho-noticias-furigana';

export type FuriganaDasNoticias = 'nenhum' | 'livro' | 'adaptativo';

function lerLocal(chave: string) {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravarLocal(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // Sem localStorage (modo privado): vale só nesta visita.
  }
}

const limitarPorDia = (n: number) => Math.min(10, Math.max(1, Math.round(n) || POR_DIA_PADRAO));

/** N da Edição do dia (1 a 10), por aparelho; vale para a próxima Edição. */
export const porDia$ = new BehaviorSubject(
  typeof window === 'undefined'
    ? POR_DIA_PADRAO
    : limitarPorDia(Number(lerLocal(CHAVE_POR_DIA) ?? POR_DIA_PADRAO))
);

export function definirPorDia(n: number) {
  const valor = limitarPorDia(n);

  gravarLocal(CHAVE_POR_DIA, String(valor));
  porDia$.next(valor);
}

/** Furigana das Notícias, separado do dos livros: Sem (padrão), NHK ou Adaptativo. */
export const furiganaDasNoticias$ = new BehaviorSubject<FuriganaDasNoticias>(
  (() => {
    const salvo = typeof window === 'undefined' ? null : lerLocal(CHAVE_FURIGANA);

    return salvo === 'livro' || salvo === 'adaptativo' ? salvo : 'nenhum';
  })()
);

export function escolherFuriganaDasNoticias(opcao: FuriganaDasNoticias) {
  gravarLocal(CHAVE_FURIGANA, opcao);
  furiganaDasNoticias$.next(opcao);
}

/** O dia de hoje pela hora de início do dia das estatísticas (a virada da Edição). */
export function hoje() {
  return getDateKey(startDayHoursForTracker$.getValue());
}

export function diaDe(iso: string) {
  return getDateKey(startDayHoursForTracker$.getValue(), new Date(iso));
}

export async function lerNoticias() {
  const [noticias, lidas, coleta] = await Promise.all([
    sincronizador().listar('noticias'),
    sincronizador().listar('noticiasLidas'),
    sincronizador().listar('coleta')
  ]);

  return {
    noticias: new Map(noticias.map((n) => [n.news_id, n])),
    lidas,
    idsLidos: new Set(lidas.map((l) => l.news_id)),
    coleta: coleta[0]
  };
}

export async function lerNoticia(id: string): Promise<LinhaNoticia | undefined> {
  return sincronizador().ler('noticias', id);
}

/** A Edição de hoje; na primeira abertura do dia, escolhe e grava (fica fixa até a virada). */
export async function edicaoDeHoje() {
  const dia = hoje();
  const gravada = await sincronizador().ler('edicoes', dia);

  if (gravada) return gravada.news_ids;

  const { noticias, idsLidos } = await lerNoticias();
  const ids = escolherEdicao([...noticias.values()], idsLidos, porDia$.getValue());

  // Sem estoque com texto (antes da primeira Coleta), não grava: a Edição sai quando houver.
  if (!ids.length) return undefined;

  const agora = new Date().toISOString();

  await sincronizador().salvar('edicoes', {
    user_id: '',
    day: dia,
    news_ids: ids,
    modified_at: agora,
    updated_at: agora,
    deleted_at: null
  });
  sincronizarEmBreve();

  return ids;
}

/** Marca (ou desmarca, no Histórico) a Notícia como lida; sobe em até ~15 s. */
export async function marcarLida(id: string, lida = true) {
  const agora = new Date().toISOString();
  const antes = await sincronizador().ler('noticiasLidas', id);

  if (!lida && !antes) return;

  await sincronizador().salvar('noticiasLidas', {
    user_id: '',
    news_id: id,
    read_at: lida ? agora : (antes?.read_at ?? agora),
    modified_at: agora,
    updated_at: agora,
    deleted_at: lida ? null : agora
  });
  sincronizarEmBreve();
}

export const coletando$ = new BehaviorSubject(false);

/**
 * Pede uma Coleta à Edge Function nhk e sincroniza o resultado. Sem `forcar`, só quando a última
 * tentativa tem mais de 12 h (a agendada roda todo dia; isto cobre a que falhou ou atrasou).
 */
export async function coletar(forcar = false) {
  if (coletando$.getValue() || !navigator.onLine) return undefined;

  const { coleta } = await lerNoticias();

  if (!forcar && !precisaColetar(coleta, Date.now())) return undefined;

  const { data: sessao } = await supabase.auth.getSession();

  if (!sessao.session) return 'Entre na conta para buscar as notícias';

  coletando$.next(true);

  try {
    const { data, error } = await supabase.functions.invoke<{ erro?: string; motivo?: string }>(
      'nhk',
      { body: { acao: 'coletar' } }
    );

    if (error) return await mensagemDaFuncao(error);

    await sincronizarAgora();

    return data?.erro ? `${data.erro}: ${data.motivo ?? ''}` : undefined;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  } finally {
    coletando$.next(false);
  }
}

/** Perfil de cada Notícia nesta visita (o texto não muda; o hub, sim: a conta é refeita). */
const perfisDasNoticias = new Map<string, Promise<PerfilDoLivro | undefined>>();

/**
 * Cobertura de cada Notícia pelo hub de agora ("92% · 6 desconhecidas"). Vazio sem dicionário
 * neste aparelho ou com o hub vazio: nada é baixado só para isso.
 */
export async function coberturasDasNoticias(noticias: LinhaNoticia[]) {
  const saida = new Map<string, string>();
  const indice = await indiceDoHub();

  if (indice.vazio) return saida;

  for (const noticia of noticias) {
    if (!noticia.body_html) continue;

    let perfil = perfisDasNoticias.get(noticia.news_id);

    if (!perfil) {
      perfil = perfilDoTexto(noticia.news_id, htmlDaNoticia(noticia));
      perfisDasNoticias.set(noticia.news_id, perfil);
    }

    const pronto = await perfil;

    if (!pronto) {
      perfisDasNoticias.delete(noticia.news_id);
      break;
    }

    saida.set(noticia.news_id, resumoDaCobertura(cobertura(pronto, indice)));
  }

  return saida;
}

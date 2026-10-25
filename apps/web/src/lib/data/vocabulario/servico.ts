/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { BehaviorSubject } from 'rxjs';
import { criarAnkiConnect } from '$lib/functions/anki/anki-connect';
import { consultarPalavra, percorrerDicionario } from '$lib/data/dicionario/servico';
import type { Entrada } from '$lib/data/dicionario/formato';
import { desfazerImportacao, jaSeiPorFrequencia, posicaoNaFrequencia } from './importacao';
import {
  sincronizador,
  sincronizarEmBreve,
  vocabMudou$
} from '$lib/data/supabase/sincronizacao/iniciar';
import type { LinhaRetrato, LinhaVocab } from '$lib/data/supabase/sincronizacao/regras';
import { sincronizarAnki, type PassoSincAnki, type ResumoSincAnki } from './sincronizar-anki';
import { desfazerJaSei, marcarJaSei } from './hub';
import { IndiceDoHub } from './indice';

// O hub no app: decks lidos, a Sincronização do Anki em andamento e o último retrato.

const CHAVE_DECKS = 'dokusho-decks-anki';
const CHAVE_DESTAQUE = 'dokusho-destaque';

function lerDestaque() {
  try {
    return localStorage.getItem(CHAVE_DESTAQUE) !== 'desligado';
  } catch {
    return true;
  }
}

/** Destaque das palavras no texto pelo estado (menu ⋯ do leitor); ligado por padrão. */
export const destaqueLigado$ = new BehaviorSubject<boolean>(
  typeof localStorage === 'undefined' ? true : lerDestaque()
);

export function alternarDestaque() {
  const ligado = !destaqueLigado$.value;
  try {
    localStorage.setItem(CHAVE_DESTAQUE, ligado ? 'ligado' : 'desligado');
  } catch {
    // Vale só nesta sessão.
  }
  destaqueLigado$.next(ligado);
}
export const DECKS_PADRAO = ['日本語'];

export function decksLidos(): string[] {
  try {
    const salvos = JSON.parse(localStorage.getItem(CHAVE_DECKS) || 'null');
    if (Array.isArray(salvos) && salvos.length) return salvos.map(String);
  } catch {
    // Sem localStorage ou valor estragado: o padrão.
  }
  return DECKS_PADRAO;
}

export function gravarDecks(decks: string[]) {
  const limpos = decks.map((d) => d.trim()).filter(Boolean);
  try {
    localStorage.setItem(CHAVE_DECKS, JSON.stringify(limpos.length ? limpos : DECKS_PADRAO));
  } catch {
    // Sem localStorage, vale o padrão.
  }
}

export type EstadoSincAnki =
  | { tipo: 'parado' }
  | { tipo: 'rodando'; passo: PassoSincAnki }
  | { tipo: 'feito'; resumo: ResumoSincAnki }
  | { tipo: 'erro'; mensagem: string; tipoErro?: string };

export const sincAnki$ = new BehaviorSubject<EstadoSincAnki>({ tipo: 'parado' });

export async function sincronizarAnkiAgora(comAnkiWeb = true) {
  if (sincAnki$.value.tipo === 'rodando') return;

  sincAnki$.next({ tipo: 'rodando', passo: 'recebendo' });

  try {
    const resumo = await sincronizarAnki({
      anki: criarAnkiConnect(),
      consultar: consultarPalavra,
      sinc: sincronizador(),
      decks: decksLidos(),
      comAnkiWeb,
      aoProgredir: (passo) => sincAnki$.next({ tipo: 'rodando', passo })
    });
    sincAnki$.next({ tipo: 'feito', resumo });
  } catch (erro) {
    sincAnki$.next({
      tipo: 'erro',
      mensagem: erro instanceof Error ? erro.message : String(erro),
      tipoErro: (erro as { tipo?: string })?.tipo
    });
  } finally {
    vocabMudou$.next();
  }
}

/** Último retrato (a data da última Sincronização do Anki, de qualquer aparelho). */
export async function ultimoRetrato(): Promise<LinhaRetrato | undefined> {
  const retratos = await sincronizador().listar('retratos');
  return retratos.sort((a, b) => (a.synced_at < b.synced_at ? 1 : -1))[0];
}

let indice: Promise<IndiceDoHub> | undefined;

// Assinado ao carregar o módulo, antes das telas: quem relê no vocabMudou$ já pega o índice novo.
vocabMudou$.subscribe(() => {
  indice = undefined;
});

/** O hub deste aparelho em memória; refeito quando o vocab muda. */
export function indiceDoHub() {
  if (!indice) {
    indice = sincronizador()
      .listar('vocab')
      .then((linhas) => new IndiceDoHub(linhas));
  }
  return indice;
}

/** "Já sei" na entrada (ADR 0013), gravado na forma que o painel mostra; a próxima rodada envia. */
export async function marcarJaSeiNaEntrada(palavra: {
  word: string;
  reading: string;
  seq: number;
}) {
  const agora = new Date().toISOString();
  const atual = await sincronizador().ler('vocab', [palavra.word, palavra.reading]);
  const linha = marcarJaSei(atual, palavra, agora);

  await sincronizador().salvar('vocab', { ...linha, user_id: '', updated_at: agora });
  vocabMudou$.next();
  sincronizarEmBreve();
}

/** Tira o "Já sei" de uma linha da tela Vocabulário (com entrada: de toda a entrada). */
export async function desfazerJaSeiDaLinha(linha: LinhaVocab) {
  const seqs = linha.jmdict_ids ?? (linha.jmdict_id ? [linha.jmdict_id] : []);

  if (seqs.length) {
    for (const seq of seqs) await desfazerJaSeiNaEntrada(seq);
    return;
  }

  const agora = new Date().toISOString();

  await sincronizador().salvar('vocab', {
    ...desfazerJaSei(linha, agora),
    user_id: linha.user_id,
    updated_at: linha.updated_at
  });
  vocabMudou$.next();
  sincronizarEmBreve();
}

/** Tira o "Já sei" de todas as linhas da entrada. */
export async function desfazerJaSeiNaEntrada(seq: number) {
  const agora = new Date().toISOString();
  const linhas = (await indiceDoHub()).linhasDaEntrada(seq).filter((l) => l.ja_sei_at);

  await sincronizador().salvarVarias(
    'vocab',
    linhas.map((l) => ({
      ...desfazerJaSei(l, agora),
      user_id: l.user_id,
      updated_at: l.updated_at
    }))
  );
  vocabMudou$.next();
  sincronizarEmBreve();
}

/** Entradas fora do Anki até a posição N do JPDB (para a prévia e a importação). */
async function entradasAte(limite: number, aoProgredir?: (fracao: number) => void) {
  const escolhidas: Entrada[] = [];
  await percorrerDicionario((entradas) => {
    for (const e of entradas) if (posicaoNaFrequencia(e) <= limite) escolhidas.push(e);
  }, aoProgredir);
  return escolhidas;
}

/** Quantas Palavras a importação inicial marcaria, sem gravar nada. */
export async function previaDaImportacao(limite: number, aoProgredir?: (fracao: number) => void) {
  const linhas = await linhasDaImportacao(limite, new Date().toISOString(), aoProgredir);
  return linhas.length;
}

async function linhasDaImportacao(
  limite: number,
  agora: string,
  aoProgredir?: (fracao: number) => void
) {
  const entradas = await entradasAte(limite, aoProgredir);
  const atuais = await sincronizador().listarComApagadas('vocab');
  return jaSeiPorFrequencia(
    entradas,
    limite,
    (await indiceDoHub()).entradasNoAnki(),
    atuais,
    agora
  );
}

/** Importação inicial: "Já sei" nas entradas até a posição N do JPDB que não estão no Anki. */
export async function importarJaSei(limite: number, aoProgredir?: (fracao: number) => void) {
  const agora = new Date().toISOString();
  const linhas = await linhasDaImportacao(limite, agora, aoProgredir);

  await sincronizador().salvarVarias(
    'vocab',
    linhas.map((l) => ({ ...l, user_id: '', updated_at: agora }))
  );
  vocabMudou$.next();
  sincronizarEmBreve();
  return linhas.length;
}

export async function desfazerImportacaoDe(quando: string) {
  const agora = new Date().toISOString();
  const linhas = desfazerImportacao(await sincronizador().listar('vocab'), quando, agora);

  await sincronizador().salvarVarias(
    'vocab',
    linhas.map((l) => ({ ...l, user_id: '', updated_at: agora }))
  );
  vocabMudou$.next();
  sincronizarEmBreve();
  return linhas.length;
}

/** Cobertura (%) de cada livro com perfil neste aparelho, pelo título (Biblioteca e Vocabulário). */
export async function coberturasPorTitulo() {
  const { lerPerfis } = await import('./perfis');
  const { cobertura } = await import('./perfil');
  const [perfis, indice, titulos] = await Promise.all([
    lerPerfis(),
    indiceDoHub(),
    sincronizador().titulosDosLivros()
  ]);
  const mapa = new Map<string, { livroId: string; porcentagem: number }>();
  for (const perfil of perfis) {
    const titulo = titulos.get(perfil.livroId) ?? perfil.livroId;
    mapa.set(titulo, {
      livroId: perfil.livroId,
      porcentagem: cobertura(perfil, indice).porcentagem
    });
  }
  return mapa;
}

/**
 * Palavras vistas nos livros com perfil neste aparelho (V3.2), cada uma uma vez, pelo estado no hub.
 * `faltam`: livros com perfil antigo, sem posições, que ainda não entram na conta.
 */
export async function palavrasVistasNosLivros() {
  const { lerPerfis } = await import('./perfis');
  const { palavrasVistas, temPosicoes } = await import('./perfil');
  const [perfis, indice, ativos] = await Promise.all([
    lerPerfis(),
    indiceDoHub(),
    sincronizador().livrosAtivos()
  ]);
  const livros = [];
  let faltam = 0;

  for (const perfil of perfis) {
    const titulo = ativos.get(perfil.livroId);
    if (!titulo) continue;
    if (!temPosicoes(perfil)) {
      faltam += 1;
      continue;
    }
    livros.push({ perfil, alcance: await sincronizador().alcanceDe(titulo) });
  }

  return { ...palavrasVistas(livros, indice), livros: livros.length, faltam };
}

/** Recalcula, um por vez, os perfis antigos (sem posições) dos livros baixados neste aparelho. */
export async function atualizarPerfisAntigos() {
  const { garantirPerfil, lerPerfis } = await import('./perfis');
  const { temPosicoes } = await import('./perfil');
  const { database } = await import('$lib/data/store');
  const ativos = await sincronizador().livrosAtivos();

  for (const perfil of await lerPerfis()) {
    const titulo = ativos.get(perfil.livroId);
    if (!titulo || temPosicoes(perfil)) continue;
    await garantirPerfil(perfil.livroId, async () => {
      const db = await database.db;
      return (await db.getFromIndex('data', 'title', titulo))?.elementHtml;
    });
  }
}

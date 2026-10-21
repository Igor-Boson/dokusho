/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { BehaviorSubject } from 'rxjs';
import { criarAnkiConnect } from '$lib/functions/anki/anki-connect';
import { consultarPalavra } from '$lib/data/dicionario/servico';
import {
  sincronizador,
  sincronizarEmBreve,
  vocabMudou$
} from '$lib/data/supabase/sincronizacao/iniciar';
import type { LinhaRetrato } from '$lib/data/supabase/sincronizacao/regras';
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

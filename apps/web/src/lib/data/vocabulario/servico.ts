/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { BehaviorSubject } from 'rxjs';
import { criarAnkiConnect } from '$lib/functions/anki/anki-connect';
import { consultarPalavra } from '$lib/data/dicionario/servico';
import { sincronizador, vocabMudou$ } from '$lib/data/supabase/sincronizacao/iniciar';
import type { LinhaRetrato } from '$lib/data/supabase/sincronizacao/regras';
import { sincronizarAnki, type PassoSincAnki, type ResumoSincAnki } from './sincronizar-anki';

// O hub no app: decks lidos, a Sincronização do Anki em andamento e o último retrato.

const CHAVE_DECKS = 'dokusho-decks-anki';
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

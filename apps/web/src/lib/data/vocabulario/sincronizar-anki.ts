/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { CardAnki, criarAnkiConnect } from '$lib/functions/anki/anki-connect';
import type { Sincronizador } from '$lib/data/supabase/sincronizacao/sincronizador';
import type { LinhaVocab } from '$lib/data/supabase/sincronizacao/regras';
import type { Consulta } from './casamento';
import { atualizarHub, contarRetrato, lotesConfirmados, palavrasDoAnki } from './hub';

// Sincronização do Anki (ESCOPO "Hub de vocabulário"; só no Windows, pelo botão): o Anki do PC
// sincroniza com o AnkiWeb, o app lê os Cards dos decks configurados, recalcula o hub, grava um
// retrato em vocab_history, confirma os Lotes que chegaram ao Anki e envia tudo ao Supabase.

export type PassoSincAnki =
  | 'recebendo'
  | 'anki-web'
  | 'lendo-cards'
  | 'casando'
  | 'gravando'
  | 'enviando';

export interface ResumoSincAnki {
  quando: string;
  cards: number;
  palavras: number;
  semEntrada: number;
  gravadas: number;
  apagadas: number;
  conhecidas: number;
  aprendendo: number;
  lotesConfirmados: number;
}

export interface OpcoesSincAnki {
  anki: Pick<ReturnType<typeof criarAnkiConnect>, 'invocar' | 'sincronizar' | 'buscarCards'>;
  consultar: Consulta;
  sinc: Pick<Sincronizador, 'listarComApagadas' | 'listar' | 'salvarVarias' | 'sincronizar'>;
  /** Decks raiz (cada um com os subdecks). */
  decks: string[];
  agora?: () => string;
  novoId?: () => string;
  /** false pula o sync do AnkiWeb (o Anki do PC já está em dia). */
  comAnkiWeb?: boolean;
  aoProgredir?: (passo: PassoSincAnki) => void;
}

export async function sincronizarAnki({
  anki,
  consultar,
  sinc,
  decks,
  agora = () => new Date().toISOString(),
  novoId = () => crypto.randomUUID(),
  comAnkiWeb = true,
  aoProgredir = () => undefined
}: OpcoesSincAnki): Promise<ResumoSincAnki> {
  // Testa o AnkiConnect antes de tudo: sem ele, nada muda.
  await anki.invocar('version');

  // Recebe antes o que os outros aparelhos marcaram ("Já sei"), para comparar com o hub atual.
  aoProgredir('recebendo');
  await sinc.sincronizar();

  if (comAnkiWeb) {
    aoProgredir('anki-web');
    await anki.sincronizar();
  }

  aoProgredir('lendo-cards');
  const porId = new Map<number, CardAnki>();
  for (const deck of decks) {
    for (const card of await anki.buscarCards(deck)) porId.set(card.cardId, card);
  }
  const cards = [...porId.values()];

  aoProgredir('casando');
  const palavras = await palavrasDoAnki(cards, consultar);

  aoProgredir('gravando');
  const quando = agora();
  const atuais = await sinc.listarComApagadas('vocab');
  const gravar = atualizarHub(atuais, palavras, quando);
  const linhas: LinhaVocab[] = gravar.map((linha) => ({
    ...linha,
    user_id: '',
    updated_at: quando
  }));

  await sinc.salvarVarias('vocab', linhas);

  const finais = new Map(atuais.map((l) => [`${l.word}|${l.reading}`, l]));
  for (const l of linhas) finais.set(`${l.word}|${l.reading}`, l);
  const retrato = contarRetrato([...finais.values()]);

  await sinc.salvarVarias('retratos', [
    {
      user_id: '',
      id: novoId(),
      synced_at: quando,
      ...retrato,
      modified_at: quando,
      updated_at: quando,
      deleted_at: null
    }
  ]);

  const lotes = await sinc.listar('lotes');
  const confirmados = new Set(lotesConfirmados(lotes, await sinc.listar('cartas'), cards));
  await sinc.salvarVarias(
    'lotes',
    lotes
      .filter((lote) => confirmados.has(lote.id))
      .map((lote) => ({ ...lote, confirmed_in_anki_at: quando, modified_at: quando }))
  );

  aoProgredir('enviando');
  await sinc.sincronizar();

  return {
    quando,
    cards: cards.length,
    palavras: palavras.length,
    semEntrada: palavras.filter((p) => !p.jmdictIds.length).length,
    gravadas: linhas.filter((l) => !l.deleted_at).length,
    apagadas: linhas.filter((l) => l.deleted_at).length,
    conhecidas: retrato.known_count,
    aprendendo: retrato.learning_count,
    lotesConfirmados: confirmados.size
  };
}

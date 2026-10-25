/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { LinhaCarta, LinhaLote } from '$lib/data/supabase/sincronizacao/regras';

// Registro do Anki na tela Início: as Cartas exportadas, agrupadas pelo dia do Lote. Carta cujo
// Lote ainda não chegou pela sincronização usa a data em que mudou para "exportada".

export type CartaDoRegistro = Pick<
  LinhaCarta,
  'id' | 'word' | 'word_reading' | 'word_meaning' | 'book_id' | 'state' | 'lote_id' | 'modified_at'
>;

export interface PalavraDoRegistro {
  id: string;
  palavra: string;
  leitura: string;
  significado?: string;
  livro?: string;
}

export function registroDoAnki(
  cartas: CartaDoRegistro[],
  lotes: Pick<LinhaLote, 'id' | 'exported_at'>[],
  titulos: Map<string, string>,
  diaDe: (quando: string) => string
) {
  const exportadoEm = new Map(lotes.map((lote) => [lote.id, lote.exported_at]));
  const porDia = new Map<string, { quando: string; palavra: PalavraDoRegistro }[]>();

  for (const carta of cartas) {
    if (carta.state !== 'exportada') continue;

    const quando = (carta.lote_id && exportadoEm.get(carta.lote_id)) || carta.modified_at;
    const dia = diaDe(quando);
    const livro = carta.book_id ? titulos.get(carta.book_id) : undefined;
    const palavra: PalavraDoRegistro = {
      id: carta.id,
      palavra: carta.word,
      leitura: carta.word_reading,
      ...(carta.word_meaning ? { significado: carta.word_meaning } : {}),
      ...(livro ? { livro } : {})
    };

    porDia.set(dia, [...(porDia.get(dia) ?? []), { quando, palavra }]);
  }

  return [...porDia]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([dia, itens]) => ({ dia, palavras: itens.map((item) => item.palavra) }));
}

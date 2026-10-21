/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { paraHiragana } from '$lib/data/dicionario/tokenizador';
import type { LinhaVocab } from '$lib/data/supabase/sincronizacao/regras';
import { estadoDaLinha } from './hub';

// Lista do hub na tela Vocabulário (V2.4): filtro pelo estado da Palavra ou pela marca "Já sei",
// busca pela escrita ou leitura, mais recentes primeiro.

export type FiltroDoHub = 'conhecida' | 'aprendendo' | 'ja-sei';

function passa(linha: LinhaVocab, filtro: FiltroDoHub) {
  if (linha.deleted_at) return false;
  return filtro === 'ja-sei' ? !!linha.ja_sei_at : estadoDaLinha(linha) === filtro;
}

export function filtrarHub(linhas: LinhaVocab[], filtro: FiltroDoHub, busca: string) {
  const termo = paraHiragana(busca.trim());
  return linhas
    .filter((l) => passa(l, filtro))
    .filter(
      (l) =>
        !termo ||
        l.word.includes(busca.trim()) ||
        paraHiragana(l.word).includes(termo) ||
        l.reading.includes(termo)
    )
    .sort((a, b) => (a.modified_at < b.modified_at ? 1 : a.modified_at > b.modified_at ? -1 : 0));
}

export function contarPorFiltro(linhas: LinhaVocab[]): Record<FiltroDoHub, number> {
  const contagem: Record<FiltroDoHub, number> = { conhecida: 0, aprendendo: 0, 'ja-sei': 0 };
  for (const l of linhas) {
    for (const filtro of Object.keys(contagem) as FiltroDoHub[]) {
      if (passa(l, filtro)) contagem[filtro] += 1;
    }
  }
  return contagem;
}

/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { BehaviorSubject } from 'rxjs';
import type { ModoFurigana } from './gerado';

// Modo do furigana (botão ふ do leitor), por aparelho. "Sem furigana" continua sendo o
// hideFurigana$ do ttu, que vale por cima de qualquer modo.

/** O que o menu ふ mostra: "nenhum" é o hideFurigana$ do ttu ligado. */
export type OpcaoFurigana = 'nenhum' | ModoFurigana;

const CHAVE = 'dokusho-furigana';
const MODOS: ModoFurigana[] = ['livro', 'todos', 'adaptativo'];

function lerModo(): ModoFurigana {
  try {
    const salvo = localStorage.getItem(CHAVE) as ModoFurigana | null;

    return salvo && MODOS.includes(salvo) ? salvo : 'livro';
  } catch {
    return 'livro';
  }
}

export const furiganaModo$ = new BehaviorSubject<ModoFurigana>(
  typeof localStorage === 'undefined' ? 'livro' : lerModo()
);

export function escolherModoFurigana(modo: ModoFurigana) {
  try {
    localStorage.setItem(CHAVE, modo);
  } catch {
    // Vale só nesta sessão.
  }
  furiganaModo$.next(modo);
}

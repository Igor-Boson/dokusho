/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

// Estado da palavra (ESCOPO "Hub de vocabulário", ADR 0007): calculado dos Cards do Anki e da
// marca "Já sei"; vale o mais avançado.

export type Estado = 'conhecida' | 'aprendendo' | 'desconhecida';

/** O que o estado usa de um Card (CardAnki tem estes campos). */
export interface CardParaEstado {
  /** Dias; negativo é segundos (Card em aprendizado). */
  intervalo: number;
  suspenso: boolean;
  leech: boolean;
  /** 0 novo, 1 aprendendo, 2 revisão, 3 reaprendendo. */
  tipo: number;
}

export const DIAS_CONHECIDA = 21;

const ORDEM: Record<Estado, number> = { desconhecida: 0, aprendendo: 1, conhecida: 2 };

/**
 * Suspenso sem leech: conhecida. Suspenso com leech: aprendendo, mesmo com intervalo longo (é a
 * palavra que você erra). Ativo: conhecida a partir de 21 dias; antes, inclusive novo, aprendendo.
 */
export function estadoDoCard({ intervalo, suspenso, leech }: CardParaEstado): Estado {
  if (suspenso) return leech ? 'aprendendo' : 'conhecida';
  return intervalo >= DIAS_CONHECIDA ? 'conhecida' : 'aprendendo';
}

export function maisAvancado(...estados: Estado[]): Estado {
  return estados.reduce<Estado>((a, b) => (ORDEM[b] > ORDEM[a] ? b : a), 'desconhecida');
}

export function estadoDaPalavra(cards: CardParaEstado[], jaSei: boolean): Estado {
  return maisAvancado(...cards.map(estadoDoCard), jaSei ? 'conhecida' : 'desconhecida');
}

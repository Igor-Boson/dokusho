/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

// Aba Palavras da tela inicial (ESCOPO "Tela inicial", V2.4): o total de palavras conhecidas ao
// longo do tempo. Não é soma por dia como tempo e caracteres: cada dia vale o último retrato da
// Sincronização do Anki até ele (vocab_history), e hoje vale o hub de agora (com os "Já sei" feitos
// depois da última sincronização).

export interface RetratoDoDia {
  /** Dia local (YYYY-MM-DD) do retrato. */
  dia: string;
  /** synced_at, para ordenar os retratos de um mesmo dia. */
  quando: string;
  conhecidas: number;
}

export function conhecidasPorDia(
  retratos: RetratoDoDia[],
  dias: string[],
  hoje: string,
  agora: number
) {
  const ordenados = [...retratos].sort((a, b) => (a.quando < b.quando ? -1 : 1));
  let i = 0;
  let valor = 0;

  return dias.map((dia) => {
    // Retratos do mesmo dia: vale o último.
    while (i < ordenados.length && ordenados[i].dia <= dia) valor = ordenados[i++].conhecidas;
    return dia === hoje ? agora : valor;
  });
}

const MAX_BARRAS_DIARIAS = 60;

/** Uma barra por dia; acima de 60 dias, uma por semana, com o valor do fim dela. */
export function barrasDeConhecidas(dias: string[], valores: number[]) {
  if (dias.length <= MAX_BARRAS_DIARIAS) {
    return dias.map((rotulo, i) => ({ rotulo, valor: valores[i] }));
  }

  const barras: { rotulo: string; valor: number }[] = [];

  dias.forEach((dia, i) => {
    if (i % 7 === 0) barras.push({ rotulo: dia, valor: 0 });
    barras[barras.length - 1].valor = valores[i];
  });

  return barras;
}

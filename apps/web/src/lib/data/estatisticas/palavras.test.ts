/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { describe, expect, it } from 'vitest';
import { barrasDeConhecidas, conhecidasPorDia } from './palavras';

// Retratos da Sincronização do Anki (vocab_history), já com o dia local.
const retratos = [
  { dia: '2026-10-10', quando: '2026-10-10T09:00:00Z', conhecidas: 900 },
  { dia: '2026-10-12', quando: '2026-10-12T08:00:00Z', conhecidas: 950 },
  { dia: '2026-10-12', quando: '2026-10-12T20:00:00Z', conhecidas: 960 },
  { dia: '2026-10-14', quando: '2026-10-14T09:00:00Z', conhecidas: 1000 }
];

describe('conhecidasPorDia (aba Palavras da tela inicial)', () => {
  it('cada dia vale o último retrato até ele; antes do primeiro, nada; hoje, o hub agora', () => {
    const dias = [
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15'
    ];

    expect(conhecidasPorDia(retratos, dias, '2026-10-15', 1010)).toEqual([
      0, 900, 900, 960, 960, 1000, 1010
    ]);
  });

  it('a ordem dos retratos não importa', () => {
    expect(
      conhecidasPorDia([...retratos].reverse(), ['2026-10-12', '2026-10-13'], '2026-10-20', 0)
    ).toEqual([960, 960]);
  });
});

describe('barrasDeConhecidas', () => {
  it('uma barra por dia até 60 dias; acima, uma por semana com o último valor dela', () => {
    const dias = Array.from({ length: 70 }, (_, i) => `d${String(i).padStart(2, '0')}`);
    const valores = dias.map((_, i) => i);
    const barras = barrasDeConhecidas(dias, valores);

    expect(barras).toHaveLength(10);
    expect(barras[0]).toEqual({ rotulo: 'd00', valor: 6 });
    expect(barras[9]).toEqual({ rotulo: 'd63', valor: 69 });
    expect(barrasDeConhecidas(dias.slice(0, 3), [1, 2, 3])).toEqual([
      { rotulo: 'd00', valor: 1 },
      { rotulo: 'd01', valor: 2 },
      { rotulo: 'd02', valor: 3 }
    ]);
  });
});

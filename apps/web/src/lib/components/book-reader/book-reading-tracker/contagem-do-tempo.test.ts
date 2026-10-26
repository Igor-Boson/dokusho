/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { describe, expect, it } from 'vitest';
import { segundosDoTique, segundosParados } from './contagem-do-tempo';

describe('segundosDoTique', () => {
  it('conta o tempo entre tiques normais', () => {
    expect(segundosDoTique(10_000, 9_000)).toBe(1);
    expect(segundosDoTique(13_000, 9_000)).toBe(4);
  });

  it('conta 1 s quando o app ficou congelado (iPhone com a tela apagada)', () => {
    const duasHoras = 2 * 60 * 60 * 1000;

    expect(segundosDoTique(duasHoras, 0)).toBe(1);
    expect(segundosDoTique(6_000, 0)).toBe(1);
  });

  it('aceita até 5 s', () => {
    expect(segundosDoTique(5_000, 0)).toBe(5);
  });

  it('não conta tempo negativo (relógio do aparelho voltou)', () => {
    expect(segundosDoTique(0, 3_000)).toBe(0);
  });
});

describe('segundosParados', () => {
  it('é o tempo já contado desde o último toque ou virada de página', () => {
    expect(segundosParados(300_000, 1_000)).toBe(299);
  });

  it('não desconta além do que foi contado quando o app congelou antes do prazo', () => {
    // Último toque em 0, app congelou no tique de 40 s: só esses 40 s foram contados.
    expect(segundosParados(40_000, 0)).toBe(40);
  });

  it('nunca é negativo', () => {
    expect(segundosParados(0, 5_000)).toBe(0);
  });
});

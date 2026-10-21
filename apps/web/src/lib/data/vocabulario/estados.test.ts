/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { describe, expect, it } from 'vitest';
import { estadoDaPalavra, estadoDoCard, maisAvancado, type CardParaEstado } from './estados';

const card = (parcial: Partial<CardParaEstado> = {}): CardParaEstado => ({
  intervalo: 5,
  suspenso: false,
  leech: false,
  tipo: 2,
  ...parcial
});

describe('estadoDoCard (ESCOPO "Hub de vocabulário")', () => {
  it('intervalo de 21 dias ou mais é conhecida', () => {
    expect(estadoDoCard(card({ intervalo: 21 }))).toBe('conhecida');
    expect(estadoDoCard(card({ intervalo: 400 }))).toBe('conhecida');
  });

  it('ativo com intervalo menor que 21 dias é aprendendo', () => {
    expect(estadoDoCard(card({ intervalo: 20 }))).toBe('aprendendo');
    expect(estadoDoCard(card({ intervalo: 1 }))).toBe('aprendendo');
  });

  it('novo, ainda não revisado, é aprendendo', () => {
    expect(estadoDoCard(card({ intervalo: 0, tipo: 0 }))).toBe('aprendendo');
  });

  it('em aprendizado (intervalo negativo, em segundos) é aprendendo', () => {
    expect(estadoDoCard(card({ intervalo: -600, tipo: 1 }))).toBe('aprendendo');
    expect(estadoDoCard(card({ intervalo: -86400 * 30, tipo: 3 }))).toBe('aprendendo');
  });

  it('suspenso sem leech é conhecida, qualquer que seja o intervalo', () => {
    expect(estadoDoCard(card({ suspenso: true, intervalo: 0, tipo: 0 }))).toBe('conhecida');
    expect(estadoDoCard(card({ suspenso: true, intervalo: 3 }))).toBe('conhecida');
  });

  it('suspenso com leech é aprendendo, mesmo com intervalo de 21 dias ou mais', () => {
    expect(estadoDoCard(card({ suspenso: true, leech: true, intervalo: 2 }))).toBe('aprendendo');
    expect(estadoDoCard(card({ suspenso: true, leech: true, intervalo: 30 }))).toBe('aprendendo');
  });

  it('leech ativo (tirado da suspensão) segue o intervalo', () => {
    expect(estadoDoCard(card({ leech: true, intervalo: 3 }))).toBe('aprendendo');
    expect(estadoDoCard(card({ leech: true, intervalo: 25 }))).toBe('conhecida');
  });
});

describe('maisAvancado', () => {
  it('conhecida > aprendendo > desconhecida', () => {
    expect(maisAvancado('aprendendo', 'conhecida')).toBe('conhecida');
    expect(maisAvancado('desconhecida', 'aprendendo')).toBe('aprendendo');
    expect(maisAvancado('desconhecida')).toBe('desconhecida');
    expect(maisAvancado()).toBe('desconhecida');
  });
});

describe('estadoDaPalavra', () => {
  it('sem Card e sem "Já sei" é desconhecida', () => {
    expect(estadoDaPalavra([], false)).toBe('desconhecida');
  });

  it('"Já sei" é conhecida', () => {
    expect(estadoDaPalavra([], true)).toBe('conhecida');
  });

  it('com mais de um Card, vale o mais avançado', () => {
    expect(estadoDaPalavra([card({ intervalo: 3 }), card({ intervalo: 40 })], false)).toBe(
      'conhecida'
    );
    expect(
      estadoDaPalavra(
        [card({ suspenso: true, leech: true }), card({ tipo: 0, intervalo: 0 })],
        false
      )
    ).toBe('aprendendo');
  });

  it('"Já sei" vence um Card aprendendo (estado mais avançado, ADR 0007)', () => {
    expect(estadoDaPalavra([card({ intervalo: 3 })], true)).toBe('conhecida');
  });
});

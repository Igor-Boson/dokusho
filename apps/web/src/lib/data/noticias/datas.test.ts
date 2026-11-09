/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { describe, expect, it } from 'vitest';
import { dataDaNoticia } from './datas';

describe('dataDaNoticia', () => {
  it('mostra o dia no Japão, como a NHK (20h10 de lá ainda é o mesmo dia)', () => {
    expect(dataDaNoticia('2026-11-09T11:10:00.000Z')).toBe('2026年11月9日');
    expect(dataDaNoticia('2026-11-09T15:30:00.000Z')).toBe('2026年11月10日');
  });
});

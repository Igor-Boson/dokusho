/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { describe, expect, it } from 'vitest';
import { capaIndependente } from './capa-independente';

/** Blob guardado que o Safari perdeu: tamanho e tipo continuam, ler falha. */
function blobPerdido(tamanho: number, tipo = 'image/jpeg') {
  const blob = new Blob([new Uint8Array(tamanho)], { type: tipo });

  blob.arrayBuffer = () => Promise.reject(new DOMException('perdido', 'NotFoundError'));

  return blob;
}

describe('capaIndependente (capa que sumia no iPhone ao regravar o livro)', () => {
  it('a capa que também é imagem do livro vira uma cópia própria, com os mesmos bytes', async () => {
    const capa = new Blob(['capa'], { type: 'image/jpeg' });
    const blobs = { 'cover.jpg': capa, 'p1.jpg': new Blob(['p1']) };

    const nova = await capaIndependente(capa, blobs);

    expect(nova).not.toBe(capa);
    expect(nova).toBeInstanceOf(Blob);
    expect(await (nova as Blob).text()).toBe('capa');
    expect((nova as Blob).type).toBe('image/jpeg');
  });

  it('capa já perdida volta pela imagem do livro de mesmo tamanho e tipo', async () => {
    const imagem = new Blob([new Uint8Array(477)], { type: 'image/jpeg' });
    const blobs = {
      'p1.jpg': new Blob([new Uint8Array(10)], { type: 'image/jpeg' }),
      'c.jpg': imagem
    };

    const nova = await capaIndependente(blobPerdido(477), blobs);

    expect(nova).toBeInstanceOf(Blob);
    expect((await (nova as Blob).arrayBuffer()).byteLength).toBe(477);
  });

  it('capa perdida sem imagem que bata fica como estava; sem capa, nada muda', async () => {
    const perdida = blobPerdido(50);

    expect(await capaIndependente(perdida, {})).toBe(perdida);
    expect(await capaIndependente('', {})).toBe('');
    expect(await capaIndependente(undefined, {})).toBeUndefined();
  });
});

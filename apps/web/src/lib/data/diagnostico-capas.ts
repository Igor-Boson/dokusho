/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { database } from '$lib/data/store';

// Diagnóstico da capa que some no iPhone depois de abrir e fechar o livro: para cada livro, confere
// se a capa e as imagens guardadas abrem, regrava o registro como o leitor faz ao abrir o livro
// (put do registro inteiro) e confere de novo a cópia antiga e a relida.

async function abre(blob: unknown) {
  if (!(blob instanceof Blob)) return 'sem capa';

  try {
    const dados = await blob.arrayBuffer();

    return `ok (${dados.byteLength} B)`;
  } catch (erro) {
    return `ERRO ${erro instanceof Error ? erro.name : String(erro)}`;
  }
}

async function imagensQueAbrem(blobs: Record<string, Blob> | undefined) {
  const lista = Object.values(blobs ?? {});
  let boas = 0;

  for (const blob of lista) {
    if ((await abre(blob)).startsWith('ok')) boas += 1;
  }

  return `${boas}/${lista.length}`;
}

export async function diagnosticarCapas() {
  const db = await database.db;
  const linhas: string[] = [];

  for (const livro of await db.getAll('data')) {
    if (!livro.elementHtml) {
      linhas.push(`${livro.title}: na nuvem (não baixado), capa ${await abre(livro.coverImage)}`);
      continue;
    }

    const capaAntes = await abre(livro.coverImage);
    const imagensAntes = await imagensQueAbrem(livro.blobs);

    await db.put('data', livro);

    const relido = await db.get('data', livro.id);

    linhas.push(
      `${livro.title}: capa ${capaAntes}, imagens ${imagensAntes} → depois de regravar: ` +
        `cópia antiga ${await abre(livro.coverImage)}, relida ${await abre(relido?.coverImage)}, ` +
        `imagens ${await imagensQueAbrem(relido?.blobs)}`
    );
  }

  return linhas;
}

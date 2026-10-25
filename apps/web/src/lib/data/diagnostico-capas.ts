/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { database } from '$lib/data/store';

// Diagnóstico da capa que some no iPhone depois de abrir e fechar o livro: só lê. Para cada livro,
// diz se a capa e cada imagem guardada ainda abrem (no Safari, um Blob guardado pode ficar
// ilegível; regravar o registro falha com "Error preparing Blob/File data").

async function abre(blob: unknown) {
  if (!(blob instanceof Blob)) return 'sem capa';

  try {
    const dados = await blob.arrayBuffer();

    return `ok (${dados.byteLength} B)`;
  } catch (erro) {
    return `ERRO ${erro instanceof Error ? erro.name : String(erro)}`;
  }
}

export async function diagnosticarCapas() {
  const db = await database.db;
  const linhas = [`Às ${new Date().toLocaleTimeString('pt-BR')}:`];

  for (const livro of await db.getAll('data')) {
    const imagens = Object.entries(livro.blobs ?? {});
    const ruins: string[] = [];

    for (const [nome, blob] of imagens) {
      if (!(await abre(blob)).startsWith('ok')) ruins.push(nome);
    }

    linhas.push(
      `${livro.title}${livro.elementHtml ? '' : ' (na nuvem)'}: capa ${await abre(livro.coverImage)}, ` +
        `imagens ${imagens.length - ruins.length}/${imagens.length} abrem` +
        (ruins.length ? ` (ilegíveis: ${ruins.slice(0, 5).join(', ')})` : '')
    );
  }

  return linhas;
}

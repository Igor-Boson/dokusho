/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

// No EPUB a capa é também uma das imagens do livro: o registro guarda o mesmo Blob duas vezes. No
// Safari, regravar esse registro (o leitor regrava a cada abertura) perde o arquivo da capa
// (NotFoundError) e as imagens seguem boas. Antes de regravar, a capa vira uma cópia própria; se
// já estiver perdida, volta pela imagem do livro de mesmo tamanho e tipo.

async function copia(blob: Blob) {
  return new Blob([await blob.arrayBuffer()], { type: blob.type });
}

export async function capaIndependente<T>(capa: T, blobs: Record<string, Blob> | undefined) {
  if (!(capa instanceof Blob)) return capa;

  try {
    return await copia(capa);
  } catch {
    const igual = Object.values(blobs ?? {}).find(
      (imagem) => imagem.size === capa.size && imagem.type === capa.type
    );

    if (igual) return copia(igual).catch(() => capa);

    return capa;
  }
}

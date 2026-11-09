/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

const PREFIXO = 'nhk:';
export const TITULO_DAS_NOTICIAS = 'NHK Easy';

export const origemDaNoticia = (id: string) => `${PREFIXO}${id}`;

export const ehNoticia = (bookId: string | null | undefined) => !!bookId?.startsWith(PREFIXO);

/** Título da origem de uma Carta: o do Livro pelo hash, ou "NHK Easy". */
export function tituloDaOrigem(bookId: string | null | undefined, titulos: Map<string, string>) {
  if (!bookId) return undefined;
  if (ehNoticia(bookId)) return TITULO_DAS_NOTICIAS;
  return titulos.get(bookId);
}

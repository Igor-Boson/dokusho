/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

/** O HTML contado: o título e o corpo, como a leitura mostra. */
export const htmlDaNoticia = (noticia: { title_ruby: string; body_html: string | null }) =>
  `<h1>${noticia.title_ruby}</h1>${noticia.body_html ?? ''}`;

/** "92% · 6 desconhecidas": cobertura e Palavras desconhecidas distintas (com entrada). */
export function resumoDaCobertura(conta: { porcentagem: number; desconhecidas: number }) {
  const { porcentagem, desconhecidas } = conta;

  if (!desconhecidas) return `${porcentagem}%`;

  return `${porcentagem}% · ${desconhecidas} ${desconhecidas === 1 ? 'desconhecida' : 'desconhecidas'}`;
}

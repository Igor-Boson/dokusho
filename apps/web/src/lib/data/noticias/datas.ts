/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

const DATA_JP = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});

export const dataDaNoticia = (iso: string) => DATA_JP.format(new Date(iso));

/** Data e hora deste aparelho, para "a última busca boa foi em ...". */
export const dataEHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });

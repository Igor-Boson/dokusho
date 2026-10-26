/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

/** Acima disso entre dois tiques, o app estava congelado (não é leitura). */
export const MAIOR_INTERVALO_DO_TIQUE = 5;

/** Segundos a somar num tique: o tempo desde o anterior, ou 1 s se o app ficou congelado. */
export function segundosDoTique(agora: number, ultimoTique: number) {
  const segundos = Math.max(0, Math.round((agora - ultimoTique) / 1000));

  return segundos > MAIOR_INTERVALO_DO_TIQUE ? 1 : segundos;
}

/**
 * Segundos já contados desde o último toque ou virada de página, para descontar quando a pausa por
 * inatividade dispara. Se o app congelou antes do prazo, desconta só o que foi contado de fato.
 */
export function segundosParados(ultimoTique: number, ultimaAtividade: number) {
  return Math.max(0, Math.round((ultimoTique - ultimaAtividade) / 1000));
}

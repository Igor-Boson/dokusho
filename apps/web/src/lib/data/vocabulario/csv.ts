/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { LinhaVocab } from '$lib/data/supabase/sincronizacao/regras';
import { estadoDaLinha } from './hub';

// Exportar CSV (V3.3): as Palavras conhecidas e aprendendo do hub, uma por linha, pelo estado que
// a tela mostra. UTF-8 com BOM e CRLF, para o Excel abrir o japonês direito.

const CABECALHO = [
  'palavra',
  'leitura',
  'estado',
  'origem',
  'intervalo (dias)',
  'JMdict',
  'atualizado em'
];

const ORDEM = { conhecida: 0, aprendendo: 1 } as const;

function campo(valor: string) {
  return /[",\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

function origem(linha: LinhaVocab) {
  const partes: string[] = [];
  if (linha.source === 'anki') partes.push('Anki');
  if (linha.ja_sei_at) partes.push('Já sei');
  return partes.join(' + ');
}

export function csvDoHub(linhas: LinhaVocab[]) {
  const corpo = linhas
    .map((linha) => ({ linha, estado: estadoDaLinha(linha) }))
    .filter(
      (item): item is { linha: LinhaVocab; estado: keyof typeof ORDEM } => item.estado in ORDEM
    )
    .sort(
      (a, b) =>
        ORDEM[a.estado] - ORDEM[b.estado] || a.linha.reading.localeCompare(b.linha.reading, 'ja')
    )
    .map(({ linha, estado }) =>
      [
        linha.word,
        linha.reading,
        estado,
        origem(linha),
        linha.source === 'anki' && linha.interval_days !== null ? String(linha.interval_days) : '',
        (linha.jmdict_ids ?? (linha.jmdict_id === null ? [] : [linha.jmdict_id])).join(' '),
        linha.modified_at.slice(0, 10)
      ]
        .map(campo)
        .join(',')
    );

  return '\uFEFF' + [CABECALHO.join(','), ...corpo].join('\r\n');
}

export function nomeDoCsv(agora = new Date()) {
  const dois = (n: number) => String(n).padStart(2, '0');
  const data = `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
  return `dokusho-vocabulario-${data}.csv`;
}

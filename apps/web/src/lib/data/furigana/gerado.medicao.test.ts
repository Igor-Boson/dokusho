/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, it } from 'vitest';
import { ordenarPorFrequencia } from '$lib/data/dicionario/banco';
import { lerArquivo, type Entrada } from '$lib/data/dicionario/formato';
import { criarTokenizador } from '$lib/data/dicionario/tokenizador';
import type { Consulta } from '$lib/data/vocabulario/casamento';
import { furiganaDoParagrafo } from './gerado';

// Teste de qualidade do furigana gerado (ESCOPO, risco "Furigana automático"): as frases das
// cartas do R5 (dicts/r5/cartas.json, de um EPUB real, fora do git) com o JMdict inteiro. Grava
// cada frase no formato 漢字[かんじ] num arquivo para conferir à mão. Rodar em apps/web:
//   $env:MEDIR_FURIGANA="<arquivo de saída>"; npx vitest run gerado.medicao

const pasta = join(process.cwd(), '../../dicts');
const saida = process.env.MEDIR_FURIGANA;

describe.skipIf(!saida || !existsSync(join(pasta, 'r5/cartas.json')))(
  'furigana gerado nas frases do R5',
  () => {
    it('gera e grava para conferir', { timeout: 300_000 }, async () => {
      const [versao] = readdirSync(join(pasta, 'saida'));
      const texto = gunzipSync(
        readFileSync(join(pasta, 'saida', versao, 'dicionario.ndjson.gz'))
      ).toString();
      const { blocosEntradas, blocosIndice } = lerArquivo(texto.split('\n').filter(Boolean));
      const entradas: Entrada[] = blocosEntradas.flatMap(([, bloco]) => bloco);
      const indice = new Map<string, number[]>();

      for (const [, bloco] of blocosIndice) {
        for (const [termo, ids] of Object.entries(bloco)) indice.set(termo, ids);
      }

      const consultar: Consulta = async (termo) =>
        ordenarPorFrequencia(
          (indice.get(termo) ?? []).map((id) => entradas[id]),
          termo
        );
      const tokenizador = await criarTokenizador(
        readFileSync(
          createRequire(import.meta.url).resolve('lindera-wasm-ipadic/lindera_wasm_ipadic_bg.wasm')
        )
      );
      const cartas = JSON.parse(readFileSync(join(pasta, 'r5/cartas.json'), 'utf8')) as {
        sentence: string;
      }[];
      const linhas: string[] = [];
      let palavras = 0;

      for (const [i, { sentence }] of cartas.entries()) {
        const frase = sentence.replace(/<[^>]*>/g, '');
        const pedacos = tokenizador.tokenizar(frase);
        const comFurigana = await furiganaDoParagrafo(consultar, pedacos, []);
        const leituras = comFurigana.flatMap((p) => p.leituras);
        let anotada = '';
        let cursor = 0;

        for (const { inicio, fim, leitura } of leituras) {
          anotada += `${frase.slice(cursor, inicio)}${frase.slice(inicio, fim)}[${leitura}]`;
          cursor = fim;
        }

        anotada += frase.slice(cursor);
        palavras += comFurigana.length;
        linhas.push(`${i + 1}. ${anotada}`);
      }

      linhas.push(`${cartas.length} frases, ${palavras} palavras com furigana`);
      writeFileSync(saida as string, `${linhas.join('\n')}\n`);
    });
  }
);

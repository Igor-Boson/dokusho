/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { supabase } from '$lib/data/supabase/client';

// Fotos das Notícias (ADR 0016): a Edge Function nhk busca na NHK, o app reduz para ~960 px de
// largura e guarda no Cache Storage deste aparelho, que funciona offline e não passa pelo Storage
// do Supabase. O service worker não apaga caches com o prefixo dokusho-.

const CACHE = 'dokusho-noticias-fotos';
const LARGURA = 960;
const POR_PEDIDO = 10;

const chave = (id: string) => `/dokusho-noticias-fotos/${id}`;

/** Fotos que a NHK não entregou nesta visita: não pede de novo a cada tela. */
const falharam = new Set<string>();

function abrir() {
  return typeof caches === 'undefined' ? undefined : caches.open(CACHE);
}

/** Endereço local (blob:) da foto guardada, ou undefined. Quem chama revoga com URL.revokeObjectURL. */
export async function fotoDe(id: string) {
  const cache = await abrir();
  const resposta = await cache?.match(chave(id));

  return resposta ? URL.createObjectURL(await resposta.blob()) : undefined;
}

function deBase64(dados: string, tipo: string) {
  const binario = atob(dados);
  const bytes = new Uint8Array(binario.length);

  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);

  return new Blob([bytes], { type: tipo });
}

async function reduzir(foto: Blob) {
  try {
    const imagem = await createImageBitmap(foto);
    const escala = Math.min(1, LARGURA / imagem.width);
    const largura = Math.round(imagem.width * escala);
    const altura = Math.round(imagem.height * escala);
    const tela = document.createElement('canvas');

    tela.width = largura;
    tela.height = altura;
    tela.getContext('2d')?.drawImage(imagem, 0, 0, largura, altura);
    imagem.close();

    const reduzida = await new Promise<Blob | null>((ok) => tela.toBlob(ok, 'image/jpeg', 0.8));

    return reduzida && reduzida.size < foto.size ? reduzida : foto;
  } catch {
    return foto;
  }
}

/** Baixa e guarda as fotos que faltam destas Notícias (a Edição do dia, ou a que abriu). */
export async function garantirFotos(ids: string[]) {
  const cache = await abrir();

  if (!cache || !navigator.onLine) return;
  if (!(await supabase.auth.getSession()).data.session) return;

  const faltam: string[] = [];

  for (const id of ids) {
    if (!falharam.has(id) && !(await cache.match(chave(id)))) faltam.push(id);
  }

  for (let i = 0; i < faltam.length; i += POR_PEDIDO) {
    const { data, error } = await supabase.functions.invoke<{
      fotos: Record<string, { tipo: string; dados: string } | { erro: string }>;
    }>('nhk', { body: { acao: 'fotos', ids: faltam.slice(i, i + POR_PEDIDO) } });

    if (error || !data) return;

    for (const [id, foto] of Object.entries(data.fotos)) {
      if ('erro' in foto) {
        falharam.add(id);
        continue;
      }

      const reduzida = await reduzir(deBase64(foto.dados, foto.tipo));

      await cache.put(
        chave(id),
        new Response(reduzida, { headers: { 'Content-Type': reduzida.type || foto.tipo } })
      );
    }
  }
}

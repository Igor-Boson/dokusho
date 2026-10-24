/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

export type ResultadoEntrega = 'compartilhado' | 'baixado' | 'cancelado';

/**
 * A folha de compartilhamento só em tela de toque (iPhone/iPad/Android). No Windows o Chrome e o Edge
 * dizem sim ao canShare, mas recusam o .apkg no share com NotAllowedError ("Permission denied").
 */
export function usaCompartilhamento(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.canShare &&
    typeof matchMedia !== 'undefined' &&
    matchMedia('(pointer: coarse)').matches
  );
}

/**
 * Entrega o arquivo pela folha de compartilhamento ou, onde ela não existe ou recusa o arquivo, por
 * download. Chamar direto do clique: o Safari recusa navigator.share fora de um gesto recente, então
 * o arquivo precisa estar pronto antes do toque.
 */
export async function entregarArquivo(blob: Blob, nome: string): Promise<ResultadoEntrega> {
  const arquivo = new File([blob], nome, { type: 'application/octet-stream' });

  if (usaCompartilhamento() && navigator.canShare({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo] });
      return 'compartilhado';
    } catch (erro) {
      if (erro instanceof DOMException && erro.name === 'AbortError') return 'cancelado';
      // Recusa do navegador (tipo de arquivo, permissão): segue para o download.
      if (!(erro instanceof DOMException && erro.name === 'NotAllowedError')) throw erro;
    }
  }

  const url = URL.createObjectURL(arquivo);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'baixado';
}

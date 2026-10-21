<script lang="ts">
  import { onMount } from 'svelte';
  import { pedirDicionario } from '$lib/components/dicionario/pedir-dicionario';
  import { sincronizador, vocabMudou$ } from '$lib/data/supabase/sincronizacao/iniciar';
  import { importacoes } from '$lib/data/vocabulario/importacao';
  import {
    desfazerImportacaoDe,
    importarJaSei,
    previaDaImportacao
  } from '$lib/data/vocabulario/servico';

  // Importação inicial do "Já sei" (ADR 0007): as palavras mais frequentes do JPDB que não estão no
  // Anki viram conhecidas. Cada importação pode ser desfeita inteira.

  let limite = 3000;
  let previa: { limite: number; palavras: number } | undefined;
  let progresso = '';
  let mensagem = '';
  let feitas: { quando: string; palavras: number }[] = [];

  async function carregar() {
    feitas = importacoes(await sincronizador().listar('vocab'));
  }

  const mostrarProgresso = (fracao: number) => {
    progresso = `Lendo o dicionário… ${Math.round(fracao * 100)}%`;
  };

  async function verPrevia() {
    if (!(await pedirDicionario())) return;
    mensagem = '';
    previa = { limite, palavras: await previaDaImportacao(limite, mostrarProgresso) };
    progresso = '';
  }

  async function importar() {
    if (!previa) return;
    progresso = 'Marcando…';
    try {
      const n = await importarJaSei(previa.limite, mostrarProgresso);
      mensagem = `${n.toLocaleString('pt-BR')} palavras marcadas com "Já sei".`;
      previa = undefined;
    } catch (e) {
      mensagem = e instanceof Error ? e.message : String(e);
    } finally {
      progresso = '';
    }
  }

  async function desfazer(quando: string) {
    const n = await desfazerImportacaoDe(quando);
    mensagem = `${n.toLocaleString('pt-BR')} palavras voltaram a desconhecidas.`;
  }

  const dataHora = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  $: if (previa && previa.limite !== limite) previa = undefined;

  onMount(() => {
    carregar();
    const assinatura = vocabMudou$.subscribe(carregar);
    return () => assinatura.unsubscribe();
  });
</script>

<section class="dokusho-importar">
  <h2>"Já sei" pela frequência</h2>
  <p>
    Marca como conhecidas as palavras mais frequentes do JPDB que não estão no Anki. Partículas e
    auxiliares ficam de fora. Dá para desfazer.
  </p>

  <label>
    Até a posição
    <input type="number" min="100" step="500" bind:value={limite} />
    do JPDB
  </label>

  {#if progresso}
    <p class="dokusho-importar__progresso">{progresso}</p>
  {:else if previa}
    <button class="dokusho-importar__primario" on:click={importar}>
      Marcar {previa.palavras.toLocaleString('pt-BR')} palavras com "Já sei"
    </button>
  {:else}
    <button on:click={verPrevia}>Ver quantas palavras</button>
  {/if}

  {#if mensagem}<p class="dokusho-importar__mensagem">{mensagem}</p>{/if}

  {#each feitas as feita (feita.quando)}
    <div class="dokusho-importar__feita">
      <span>{dataHora(feita.quando)} · {feita.palavras.toLocaleString('pt-BR')} palavras</span>
      <button on:click={() => desfazer(feita.quando)}>Desfazer</button>
    </div>
  {/each}
</section>

<style lang="scss">
  .dokusho-importar {
    margin-top: 12px;
    padding: 14px 16px;
    border-radius: 14px;
    background: var(--dk-surface);
    box-shadow: 0 1px 3px var(--dk-shadow);
    font-size: 14px;

    h2 {
      font-size: 17px;
      font-weight: 700;
    }

    p {
      margin-top: 6px;
      color: var(--dk-ink2);
    }

    label {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
      color: var(--dk-ink2);
    }

    input {
      width: 90px;
      padding: 6px 8px;
      border-radius: 8px;
      border: 1px solid var(--dk-line);
      background: var(--dk-sunk);
      color: var(--dk-ink);
    }

    button {
      margin-top: 10px;
      min-height: 40px;
      padding: 0 14px;
      border-radius: 10px;
      font-weight: 700;
      color: var(--dk-accent);
      box-shadow: inset 0 0 0 1.5px var(--dk-line);
    }
  }

  .dokusho-importar__primario {
    width: 100%;
    background: var(--dk-accent);
    color: var(--dk-accent-ink) !important;
    box-shadow: none !important;
  }

  .dokusho-importar__mensagem {
    color: var(--dk-ink) !important;
  }

  .dokusho-importar__feita {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 8px;
    color: var(--dk-ink2);

    button {
      margin-top: 0;
      min-height: 32px;
    }
  }
</style>

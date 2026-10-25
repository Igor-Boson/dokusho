<script lang="ts">
  import { onMount } from 'svelte';
  import { sincronizador, vocabMudou$ } from '$lib/data/supabase/sincronizacao/iniciar';
  import type { LinhaVocab } from '$lib/data/supabase/sincronizacao/regras';
  import { estadoDaLinha } from '$lib/data/vocabulario/hub';
  import { contarPorFiltro, filtrarHub, type FiltroDoHub } from '$lib/data/vocabulario/lista';
  import { desfazerJaSeiDaLinha } from '$lib/data/vocabulario/servico';
  import { csvDoHub, nomeDoCsv } from '$lib/data/vocabulario/csv';
  import { entregarArquivo } from '$lib/functions/anki/entregar-arquivo';

  // Lista do hub (V2.4): as Palavras conhecidas, aprendendo ou com "Já sei", com busca. V3.3:
  // "Exportar CSV" com as conhecidas e aprendendo.

  const POR_VEZ = 100;
  const FILTROS: [FiltroDoHub, string][] = [
    ['conhecida', 'Conhecidas'],
    ['aprendendo', 'Aprendendo'],
    ['ja-sei', 'Já sei']
  ];

  let linhas: LinhaVocab[] = [];
  let filtro: FiltroDoHub = 'conhecida';
  let busca = '';
  let mostrando = POR_VEZ;
  let carregado = false;

  $: contagem = contarPorFiltro(linhas);
  $: lista = filtrarHub(linhas, filtro, busca);
  $: if (filtro || busca !== undefined) mostrando = POR_VEZ;

  let aviso = '';

  /** Direto do clique: o Safari só abre a folha de compartilhamento num gesto recente. */
  async function exportarCsv() {
    aviso = '';
    try {
      const blob = new Blob([csvDoHub(linhas)], { type: 'text/csv;charset=utf-8' });
      await entregarArquivo(blob, nomeDoCsv());
    } catch (erro) {
      aviso = `Não deu para exportar: ${erro instanceof Error ? erro.message : erro}`;
    }
  }

  async function carregar() {
    linhas = await sincronizador().listar('vocab');
    carregado = true;
  }

  function origem(linha: LinhaVocab) {
    const partes: string[] = [];
    if (linha.source === 'anki') {
      partes.push('Anki');
      if (linha.suspended) partes.push('suspenso');
      if (linha.leech) partes.push('leech');
      if (linha.interval_days) partes.push(`${linha.interval_days} d`);
    }
    if (linha.ja_sei_at) {
      partes.push(`"Já sei" em ${new Date(linha.ja_sei_at).toLocaleDateString('pt-BR')}`);
    }
    return partes.join(' · ');
  }

  onMount(() => {
    carregar();
    const assinatura = vocabMudou$.subscribe(carregar);
    return () => assinatura.unsubscribe();
  });
</script>

<section class="dokusho-hub">
  <div class="dokusho-hub__topo">
    <h2>Palavras</h2>
    {#if contagem.conhecida + contagem.aprendendo}
      <button on:click={exportarCsv}>Exportar CSV</button>
    {/if}
  </div>
  {#if aviso}<p class="dokusho-hub__vazio">{aviso}</p>{/if}
  <div class="dokusho-hub__filtros">
    {#each FILTROS as [valor, rotulo]}
      <button class:ativa={filtro === valor} on:click={() => (filtro = valor)}>
        {rotulo} <small>{contagem[valor].toLocaleString('pt-BR')}</small>
      </button>
    {/each}
  </div>
  <input
    class="dokusho-hub__busca"
    type="search"
    placeholder="Buscar pela escrita ou leitura"
    bind:value={busca}
  />

  {#each lista.slice(0, mostrando) as linha (linha.word + '|' + linha.reading)}
    {@const estado = estadoDaLinha(linha)}
    <div class="dokusho-hub__linha">
      <div>
        <span class="dokusho-hub__escrita" lang="ja">{linha.word}</span>
        {#if linha.reading !== linha.word}<small lang="ja">{linha.reading}</small>{/if}
        <div class="dokusho-hub__origem">{origem(linha)}</div>
      </div>
      <span class="dokusho-hub__estado dokusho-hub__estado--{estado}">{estado}</span>
      {#if linha.ja_sei_at}
        <button on:click={() => desfazerJaSeiDaLinha(linha)}>Desfazer</button>
      {/if}
    </div>
  {:else}
    <p class="dokusho-hub__vazio">
      {#if !carregado}
        Carregando…
      {:else if linhas.length}
        Nada com esse filtro.
      {:else}
        O hub está vazio: sincronize o Anki no PC.
      {/if}
    </p>
  {/each}
  {#if lista.length > mostrando}
    <button class="dokusho-hub__mais" on:click={() => (mostrando += POR_VEZ)}
      >Mostrar mais ({(lista.length - mostrando).toLocaleString('pt-BR')})</button
    >
  {/if}
</section>

<style lang="scss">
  .dokusho-hub {
    margin-top: 18px;
    font-size: 14px;

    h2 {
      font-size: 17px;
      font-weight: 700;
    }
  }

  .dokusho-hub__topo {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;

    button {
      min-height: 32px;
      padding: 0 12px;
      border-radius: 9px;
      font-size: 13px;
      font-weight: 700;
      color: var(--dk-accent);
      box-shadow: inset 0 0 0 1.5px var(--dk-line);
    }
  }

  .dokusho-hub__filtros {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 11px;
    background: var(--dk-sunk);

    button {
      flex: 1;
      min-height: 34px;
      border-radius: 9px;
      font-size: 13px;
      color: var(--dk-ink2);

      &.ativa {
        background: var(--dk-surface);
        color: var(--dk-ink);
        box-shadow: 0 1px 3px var(--dk-shadow);
      }
    }

    small {
      color: var(--dk-ink3);
    }
  }

  .dokusho-hub__busca {
    width: 100%;
    margin-top: 8px;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid var(--dk-line);
    background: var(--dk-surface);
    color: var(--dk-ink);
  }

  .dokusho-hub__linha {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 10px;
    align-items: center;
    padding: 9px 2px;
    border-bottom: 1px solid var(--dk-line);

    small {
      margin-left: 6px;
      color: var(--dk-ink2);
    }

    button {
      min-height: 32px;
      padding: 0 10px;
      border-radius: 9px;
      font-size: 13px;
      font-weight: 700;
      color: var(--dk-accent);
      box-shadow: inset 0 0 0 1.5px var(--dk-line);
    }
  }

  .dokusho-hub__escrita {
    font-size: 18px;
    font-weight: 700;
  }

  .dokusho-hub__origem {
    font-size: 12px;
    color: var(--dk-ink3);
  }

  .dokusho-hub__estado {
    font-size: 12px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 99px;
  }

  .dokusho-hub__estado--conhecida {
    background: var(--dk-read-soft);
    color: var(--dk-read);
  }

  .dokusho-hub__estado--aprendendo {
    background: var(--dk-warn-soft);
    color: var(--dk-warn);
  }

  .dokusho-hub__vazio {
    padding: 20px 4px;
    color: var(--dk-ink3);
  }

  .dokusho-hub__mais {
    width: 100%;
    min-height: 40px;
    margin-top: 10px;
    border-radius: 10px;
    font-weight: 700;
    color: var(--dk-accent);
    box-shadow: inset 0 0 0 1.5px var(--dk-line);
  }
</style>

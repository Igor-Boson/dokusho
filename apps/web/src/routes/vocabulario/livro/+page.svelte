<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import NavegacaoInferior from '$lib/components/navegacao/navegacao-inferior.svelte';
  import { pagePath } from '$lib/data/env';
  import { database } from '$lib/data/store';
  import { consultarPalavra } from '$lib/data/dicionario/servico';
  import { sincronizador, vocabMudou$ } from '$lib/data/supabase/sincronizacao/iniciar';
  import { cobertura, desconhecidas, type ItemDoPerfil } from '$lib/data/vocabulario/perfil';
  import {
    garantirPerfil,
    lerPerfil,
    perfilPronto$,
    progressoDoPerfil$
  } from '$lib/data/vocabulario/perfis';
  import { indiceDoHub, marcarJaSeiNaEntrada } from '$lib/data/vocabulario/servico';
  import { formatPageTitle } from '$lib/functions/format-page-title';

  // Palavras do livro (V2.3): cobertura e as desconhecidas, da mais frequente no livro para a menos,
  // com "Já sei" em cada uma.

  const POR_VEZ = 50;

  $: livroId = browser ? ($page.url.searchParams.get('id') ?? '') : '';

  let titulo = '';
  let resumo: ReturnType<typeof cobertura> | undefined;
  let lista: ItemDoPerfil[] = [];
  let mostrando = POR_VEZ;
  let glosas = new Map<number, string>();
  let calculando: number | undefined;
  let semPerfil = false;
  let mensagem = '';

  async function carregar() {
    if (!livroId) return;
    titulo = (await sincronizador().titulosDosLivros()).get(livroId) ?? livroId;
    const perfil = await lerPerfil(livroId);
    semPerfil = !perfil;
    if (!perfil) return;
    const indice = await indiceDoHub();
    resumo = cobertura(perfil, indice);
    lista = desconhecidas(perfil, indice);
    await carregarGlosas();
  }

  async function carregarGlosas() {
    const novas = new Map(glosas);
    for (const item of lista.slice(0, mostrando)) {
      if (item.seq === null || novas.has(item.seq)) continue;
      const entrada = (await consultarPalavra(item.escrita)).find((e) => e.seq === item.seq);
      novas.set(item.seq, entrada?.sentidos[0]?.g.slice(0, 3).join('; ') ?? '');
    }
    glosas = novas;
  }

  async function htmlDoLivro() {
    const db = await database.db;
    return (await db.getFromIndex('data', 'title', titulo))?.elementHtml;
  }

  async function calcular() {
    mensagem = '';
    calculando = 0;
    const perfil = await garantirPerfil(livroId, htmlDoLivro);
    calculando = undefined;
    if (!perfil)
      mensagem = 'Baixe o livro (Biblioteca) e o dicionário (toque numa palavra no Leitor) antes.';
    await carregar();
  }

  async function jaSei(item: ItemDoPerfil) {
    if (item.seq === null) return;
    await marcarJaSeiNaEntrada({ word: item.escrita, reading: item.leitura, seq: item.seq });
  }

  async function mostrarMais() {
    mostrando += POR_VEZ;
    await carregarGlosas();
  }

  onMount(() => {
    carregar();
    const assinaturas = [
      vocabMudou$.subscribe(carregar),
      perfilPronto$.subscribe((id) => id === livroId && carregar()),
      progressoDoPerfil$.subscribe(({ livroId: id, fracao }) => {
        if (id === livroId) calculando = fracao;
      })
    ];
    return () => assinaturas.forEach((a) => a.unsubscribe());
  });
</script>

<svelte:head>
  <title>{formatPageTitle('Palavras do livro')}</title>
</svelte:head>

<main class="dokusho-livro">
  <header>
    <a href="{pagePath}/vocabulario">‹ Vocabulário</a>
    <h1 lang="ja">{titulo}</h1>
  </header>

  {#if resumo}
    <section class="dokusho-livro__resumo">
      <div class="dokusho-livro__porcentagem">{resumo.porcentagem}%</div>
      <div>
        <b>cobertura</b>: das {resumo.ocorrencias.toLocaleString('pt-BR')} palavras do texto (sem gramática),
        {resumo.conhecidas.toLocaleString('pt-BR')} são conhecidas.<br />
        {resumo.palavras.toLocaleString('pt-BR')} palavras diferentes:
        {resumo.palavrasConhecidas.toLocaleString('pt-BR')} conhecidas,
        {resumo.aprendendo.toLocaleString('pt-BR')} aprendendo,
        {resumo.desconhecidas.toLocaleString('pt-BR')} desconhecidas.
      </div>
    </section>

    <h2>Desconhecidas, das mais frequentes no livro</h2>
    {#each lista.slice(0, mostrando) as item (`${item.seq}|${item.leitura}`)}
      <div class="dokusho-livro__palavra">
        <div>
          <span class="dokusho-livro__escrita" lang="ja">{item.escrita}</span>
          {#if item.leitura && item.leitura !== item.escrita}<small lang="ja">{item.leitura}</small
            >{/if}
          <div class="dokusho-livro__glosa">
            {(item.seq !== null && glosas.get(item.seq)) || ''}
          </div>
        </div>
        <span class="dokusho-livro__vezes">×{item.ocorrencias}</span>
        <button on:click={() => jaSei(item)}>Já sei</button>
      </div>
    {:else}
      <p class="dokusho-livro__vazio">Nenhuma palavra desconhecida neste livro.</p>
    {/each}
    {#if lista.length > mostrando}
      <button class="dokusho-livro__mais" on:click={mostrarMais}
        >Mostrar mais ({(lista.length - mostrando).toLocaleString('pt-BR')})</button
      >
    {/if}
  {:else if calculando !== undefined}
    <p class="dokusho-livro__vazio">Calculando… {Math.round(calculando * 100)}%</p>
  {:else if semPerfil}
    <p class="dokusho-livro__vazio">
      A cobertura é calculada quando você abre o livro no Leitor, ou agora:
    </p>
    <button class="dokusho-livro__mais" on:click={calcular}>Calcular agora</button>
    {#if mensagem}<p class="dokusho-livro__vazio">{mensagem}</p>{/if}
  {/if}
</main>

<NavegacaoInferior />

<style lang="scss">
  .dokusho-livro {
    max-width: 640px;
    margin: 0 auto;
    padding: 0 18px calc(120px + env(safe-area-inset-bottom, 0px));
    font-family: 'Noto Sans JP', system-ui, sans-serif;
    color: var(--dk-ink);

    header {
      padding: 22px 0 10px;

      a {
        font-size: 14px;
        color: var(--dk-accent);
      }
    }

    h1 {
      font-size: 24px;
      font-weight: 700;
    }

    h2 {
      margin: 18px 0 6px;
      font-size: 15px;
      font-weight: 700;
      color: var(--dk-ink2);
    }
  }

  .dokusho-livro__resumo {
    display: flex;
    gap: 14px;
    align-items: center;
    padding: 14px 16px;
    border-radius: 14px;
    background: var(--dk-surface);
    box-shadow: 0 1px 3px var(--dk-shadow);
    font-size: 14px;
    color: var(--dk-ink2);
  }

  .dokusho-livro__porcentagem {
    font-size: 34px;
    font-weight: 700;
    color: var(--dk-read);
  }

  .dokusho-livro__palavra {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 10px;
    align-items: center;
    padding: 10px 2px;
    border-bottom: 1px solid var(--dk-line);

    small {
      margin-left: 6px;
      font-size: 13px;
      color: var(--dk-ink2);
    }

    button {
      min-height: 34px;
      padding: 0 12px;
      border-radius: 9px;
      font-size: 13px;
      font-weight: 700;
      color: var(--dk-accent);
      box-shadow: inset 0 0 0 1.5px var(--dk-line);
    }
  }

  .dokusho-livro__escrita {
    font-size: 19px;
    font-weight: 700;
  }

  .dokusho-livro__glosa {
    font-size: 13px;
    color: var(--dk-ink3);
  }

  .dokusho-livro__vezes {
    font-size: 13px;
    color: var(--dk-ink2);
  }

  .dokusho-livro__vazio {
    padding: 20px 4px;
    color: var(--dk-ink3);
    font-size: 14px;
  }

  .dokusho-livro__mais {
    width: 100%;
    min-height: 40px;
    margin-top: 10px;
    border-radius: 10px;
    font-weight: 700;
    color: var(--dk-accent);
    box-shadow: inset 0 0 0 1.5px var(--dk-line);
  }
</style>

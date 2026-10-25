<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import NavegacaoInferior from '$lib/components/navegacao/navegacao-inferior.svelte';
  import { pagePath } from '$lib/data/env';
  import { database } from '$lib/data/store';
  import { consultarPalavra } from '$lib/data/dicionario/servico';
  import {
    apelidos$,
    nomeDoLivro,
    sincronizador,
    vocabMudou$
  } from '$lib/data/supabase/sincronizacao/iniciar';
  import {
    cobertura,
    desconhecidas,
    desconhecidasVistas,
    leituraDoLivro,
    temPosicoes,
    type ItemDoPerfil
  } from '$lib/data/vocabulario/perfil';
  import {
    garantirPerfil,
    lerPerfil,
    perfilPronto$,
    progressoDoPerfil$
  } from '$lib/data/vocabulario/perfis';
  import { indiceDoHub, marcarJaSeiNaEntrada } from '$lib/data/vocabulario/servico';
  import { formatPageTitle } from '$lib/functions/format-page-title';

  // Palavras do livro (V2.3): cobertura e as desconhecidas, da mais frequente no livro para a menos,
  // com "Já sei" em cada uma. V3.2: quanto já foi lido, a cobertura antes e depois do Alcance e as
  // desconhecidas que já apareceram no trecho lido.

  const POR_VEZ = 50;

  $: livroId = browser ? ($page.url.searchParams.get('id') ?? '') : '';

  let titulo = '';
  let resumo: ReturnType<typeof cobertura> | undefined;
  let leitura: ReturnType<typeof leituraDoLivro> | undefined;
  let todas: ItemDoPerfil[] = [];
  let vistas: { item: ItemDoPerfil; vezes: number }[] = [];
  let aba: 'vistas' | 'todas' | undefined;
  let mostrando = POR_VEZ;
  let glosas = new Map<number, string>();
  let calculando: number | undefined;
  let recalculou = false;
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
    todas = desconhecidas(perfil, indice);
    if (temPosicoes(perfil)) {
      const alcance = await sincronizador().alcanceDe(titulo);
      leitura = leituraDoLivro(perfil, indice, alcance);
      vistas = desconhecidasVistas(perfil, indice, alcance);
      aba ??= leitura.lido > 0 ? 'vistas' : 'todas';
    } else {
      // Perfil da V2.3, sem posições: calcula de novo em segundo plano.
      leitura = undefined;
      aba = 'todas';
      if (!recalculou && calculando === undefined) {
        recalculou = true;
        calcular();
      }
    }
    await carregarGlosas();
  }

  $: lista =
    aba === 'vistas'
      ? vistas
      : todas.map((item) => ({ item, vezes: undefined as number | undefined }));

  async function trocarAba(nova: 'vistas' | 'todas') {
    aba = nova;
    mostrando = POR_VEZ;
    await carregarGlosas();
  }

  async function carregarGlosas() {
    const novas = new Map(glosas);
    for (const { item } of lista.slice(0, mostrando)) {
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
    <h1 lang="ja">{nomeDoLivro(titulo, $apelidos$)}</h1>
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

    {#if !leitura && calculando !== undefined}
      <p class="dokusho-livro__vazio">
        Calculando as palavras vistas… {Math.round(calculando * 100)}%
      </p>
    {/if}

    {#if leitura}
      <section class="dokusho-livro__leitura">
        <div><b>{leitura.lido}%</b> do livro lido</div>
        {#if leitura.lida.ocorrencias && leitura.restante.ocorrencias}
          <div>
            cobertura no que você leu: <b>{leitura.lida.porcentagem}%</b> · no que falta:
            <b>{leitura.restante.porcentagem}%</b>
          </div>
        {/if}
      </section>

      <div class="dokusho-livro__abas" role="tablist">
        <button
          role="tab"
          aria-selected={aba === 'vistas'}
          class:ativa={aba === 'vistas'}
          on:click={() => trocarAba('vistas')}
          >Já vistas ({vistas.length.toLocaleString('pt-BR')})</button
        >
        <button
          role="tab"
          aria-selected={aba === 'todas'}
          class:ativa={aba === 'todas'}
          on:click={() => trocarAba('todas')}
          >No livro todo ({todas.length.toLocaleString('pt-BR')})</button
        >
      </div>
    {/if}

    <h2>
      {aba === 'vistas'
        ? 'Desconhecidas que você já viu, das mais vistas'
        : 'Desconhecidas, das mais frequentes no livro'}
    </h2>
    {#each lista.slice(0, mostrando) as { item, vezes } (`${item.seq}|${item.leitura}|${item.escrita}`)}
      <div class="dokusho-livro__palavra">
        <div>
          <span class="dokusho-livro__escrita" lang="ja">{item.escrita}</span>
          {#if item.leitura && item.leitura !== item.escrita}<small lang="ja">{item.leitura}</small
            >{/if}
          <div class="dokusho-livro__glosa">
            {(item.seq !== null && glosas.get(item.seq)) || ''}
          </div>
        </div>
        <span class="dokusho-livro__vezes"
          >{vezes === undefined
            ? `×${item.ocorrencias}`
            : `vista ×${vezes} de ${item.ocorrencias}`}</span
        >
        <button on:click={() => jaSei(item)}>Já sei</button>
      </div>
    {:else}
      <p class="dokusho-livro__vazio">
        {aba === 'vistas'
          ? 'Nenhuma palavra desconhecida no trecho que você já leu.'
          : 'Nenhuma palavra desconhecida neste livro.'}
      </p>
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

  .dokusho-livro__leitura {
    margin-top: 10px;
    padding: 12px 16px;
    border-radius: 14px;
    background: var(--dk-surface);
    box-shadow: 0 1px 3px var(--dk-shadow);
    font-size: 14px;
    line-height: 1.7;
    color: var(--dk-ink2);

    b {
      color: var(--dk-ink);
    }
  }

  .dokusho-livro__abas {
    display: flex;
    gap: 4px;
    margin-top: 14px;
    padding: 3px;
    border-radius: 10px;
    background: var(--dk-sunk);

    button {
      flex: 1;
      min-height: 34px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 700;
      color: var(--dk-ink2);
    }

    .ativa {
      background: var(--dk-surface);
      color: var(--dk-ink);
      box-shadow: 0 1px 2px var(--dk-shadow);
    }
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

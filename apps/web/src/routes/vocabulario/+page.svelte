<script lang="ts">
  import CartaoAnki from '$lib/components/vocabulario/cartao-anki.svelte';
  import ImportarJaSei from '$lib/components/vocabulario/importar-ja-sei.svelte';
  import LivrosCobertura from '$lib/components/vocabulario/livros-cobertura.svelte';
  import ListaHub from '$lib/components/vocabulario/lista-hub.svelte';
  import NavegacaoInferior from '$lib/components/navegacao/navegacao-inferior.svelte';
  import { formatPageTitle } from '$lib/functions/format-page-title';

  // Tela Vocabulário (ESCOPO "Hub de vocabulário"): a Sincronização do Anki, a cobertura dos
  // livros, o "Já sei" pela frequência e a lista do hub.
</script>

<svelte:head>
  <title>{formatPageTitle('Vocabulário')}</title>
</svelte:head>

<main class="dokusho-vocab">
  <header><h1>Vocabulário</h1></header>

  <CartaoAnki />
  <LivrosCobertura />
  <ImportarJaSei />
  <ListaHub />
</main>

<NavegacaoInferior />

<style lang="scss">
  .dokusho-vocab {
    max-width: 640px;
    margin: 0 auto;
    padding: 0 18px calc(120px + env(safe-area-inset-bottom, 0px));
    font-family: 'Noto Sans JP', system-ui, sans-serif;
    color: var(--dk-ink);

    header {
      padding: 22px 0 10px;
    }

    h1 {
      font-size: 28px;
      font-weight: 700;
    }
  }
</style>

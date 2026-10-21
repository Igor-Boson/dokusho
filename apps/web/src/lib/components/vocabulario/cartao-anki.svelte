<script lang="ts">
  import { onMount } from 'svelte';
  import { pedirDicionario } from '$lib/components/dicionario/pedir-dicionario';
  import { sincronizador, vocabMudou$ } from '$lib/data/supabase/sincronizacao/iniciar';
  import type { LinhaRetrato } from '$lib/data/supabase/sincronizacao/regras';
  import type { PassoSincAnki } from '$lib/data/vocabulario/sincronizar-anki';
  import {
    decksLidos,
    gravarDecks,
    sincAnki$,
    sincronizarAnkiAgora,
    ultimoRetrato
  } from '$lib/data/vocabulario/servico';

  // Sincronização do Anki (ESCOPO "Hub de vocabulário"): o botão só aparece no Windows, onde o
  // Anki do PC e o AnkiConnect estão; nos outros aparelhos, só a data da última.

  const PASSOS: Record<PassoSincAnki, string> = {
    recebendo: 'Recebendo o hub dos outros aparelhos…',
    'anki-web': 'O Anki está sincronizando com o AnkiWeb…',
    'lendo-cards': 'Lendo os Cards…',
    casando: 'Ligando as Palavras ao dicionário…',
    gravando: 'Gravando o hub…',
    enviando: 'Enviando ao servidor…'
  };

  let retrato: LinhaRetrato | undefined;
  let decks = '';
  let editandoDecks = false;
  let comAnkiWeb = true;

  // Decidido no navegador: no build (SSR) o navigator é o do Node.
  let noWindows = false;

  async function carregar() {
    retrato = await ultimoRetrato();
  }

  async function sincronizar() {
    if (!(await pedirDicionario())) return;
    await sincronizarAnkiAgora(comAnkiWeb);
  }

  function salvarDecks() {
    gravarDecks(decks.split(/[,、\n]/));
    decks = decksLidos().join(', ');
    editandoDecks = false;
  }

  const dataHora = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  onMount(() => {
    noWindows = sincronizador().aparelho.nome === 'Windows';
    decks = decksLidos().join(', ');
    carregar();
    const assinatura = vocabMudou$.subscribe(carregar);
    return () => assinatura.unsubscribe();
  });
</script>

<section class="dokusho-anki">
  <div class="dokusho-anki__topo">
    <h2>Anki</h2>
    {#if retrato}
      <span>última sincronização {dataHora(retrato.synced_at)}</span>
    {:else}
      <span>nunca sincronizado</span>
    {/if}
  </div>

  {#if retrato}
    <p class="dokusho-anki__numeros">
      <b class="dokusho-anki__conhecida">{retrato.known_count.toLocaleString('pt-BR')}</b>
      conhecidas ·
      <b class="dokusho-anki__aprendendo">{retrato.learning_count.toLocaleString('pt-BR')}</b>
      aprendendo
    </p>
  {/if}

  {#if noWindows}
    {#if $sincAnki$.tipo === 'rodando'}
      <p class="dokusho-anki__passo">{PASSOS[$sincAnki$.passo]}</p>
    {:else if $sincAnki$.tipo === 'feito'}
      {@const r = $sincAnki$.resumo}
      <p class="dokusho-anki__resumo">
        {r.cards} Cards, {r.palavras} Palavras ({r.semEntrada} sem entrada no dicionário).
        {r.gravadas} novas ou mudadas, {r.apagadas} saíram do Anki.
        {#if r.lotesConfirmados}{r.lotesConfirmados}
          {r.lotesConfirmados === 1 ? 'Lote confirmado' : 'Lotes confirmados'} no Anki.{/if}
      </p>
    {:else if $sincAnki$.tipo === 'erro'}
      <p class="dokusho-anki__erro">
        {$sincAnki$.mensagem}
        {#if $sincAnki$.tipoErro === 'rede'}<br /><small
            >Abra o Anki do PC. Configuração do AnkiConnect em docs/ANKI-CONNECT.md.</small
          >{/if}
      </p>
    {/if}

    <button
      class="dokusho-anki__botao"
      disabled={$sincAnki$.tipo === 'rodando'}
      on:click={sincronizar}
    >
      {$sincAnki$.tipo === 'rodando' ? 'Sincronizando…' : 'Sincronizar Anki'}
    </button>

    <details class="dokusho-anki__opcoes">
      <summary>Opções</summary>
      <label>
        <input type="checkbox" bind:checked={comAnkiWeb} />
        Sincronizar o Anki com o AnkiWeb antes (pega as revisões do celular)
      </label>
      {#if editandoDecks}
        <label class="dokusho-anki__decks">
          Decks lidos, com os subdecks (separe por vírgula)
          <input bind:value={decks} />
        </label>
        <button on:click={salvarDecks}>Salvar decks</button>
      {:else}
        <p>
          Decks lidos: <span lang="ja">{decks}</span> e subdecks.
          <button class="dokusho-anki__link" on:click={() => (editandoDecks = true)}>Alterar</button
          >
        </p>
      {/if}
    </details>
  {:else}
    <p class="dokusho-anki__nota">
      A Sincronização do Anki é feita no PC (Windows), com o Anki aberto. Aqui o hub chega pela
      sincronização normal.
    </p>
  {/if}
</section>

<style lang="scss">
  .dokusho-anki {
    margin-top: 12px;
    padding: 14px 16px;
    border-radius: 14px;
    background: var(--dk-surface);
    box-shadow: 0 1px 3px var(--dk-shadow);
    font-size: 14px;
  }

  .dokusho-anki__topo {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;

    h2 {
      font-size: 17px;
      font-weight: 700;
    }

    span {
      font-size: 12px;
      color: var(--dk-ink3);
    }
  }

  .dokusho-anki__numeros {
    margin-top: 6px;
    color: var(--dk-ink2);

    b {
      font-size: 18px;
    }
  }

  .dokusho-anki__conhecida {
    color: var(--dk-read);
  }

  .dokusho-anki__aprendendo {
    color: var(--dk-warn);
  }

  .dokusho-anki__passo,
  .dokusho-anki__resumo,
  .dokusho-anki__nota {
    margin-top: 8px;
    color: var(--dk-ink2);
  }

  .dokusho-anki__erro {
    margin-top: 8px;
    color: var(--dk-err);

    small {
      color: var(--dk-ink2);
    }
  }

  .dokusho-anki__botao {
    width: 100%;
    min-height: 44px;
    margin-top: 12px;
    border-radius: 12px;
    background: var(--dk-accent);
    color: var(--dk-accent-ink);
    font-weight: 700;

    &:disabled {
      opacity: 0.6;
    }
  }

  .dokusho-anki__opcoes {
    margin-top: 10px;
    color: var(--dk-ink2);
    font-size: 13px;

    summary {
      cursor: pointer;
    }

    label,
    p {
      display: block;
      margin-top: 8px;
    }

    input:not([type='checkbox']) {
      display: block;
      width: 100%;
      margin-top: 4px;
      padding: 6px 8px;
      border-radius: 8px;
      border: 1px solid var(--dk-line);
      background: var(--dk-sunk);
      color: var(--dk-ink);
    }

    button {
      margin-top: 6px;
      font-weight: 700;
      color: var(--dk-accent);
    }
  }

  .dokusho-anki__link {
    margin: 0 !important;
  }
</style>

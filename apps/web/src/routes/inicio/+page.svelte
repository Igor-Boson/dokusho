<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import NavegacaoInferior from '$lib/components/navegacao/navegacao-inferior.svelte';
  import { ReadingGoalFrequency } from '$lib/components/book-reader/book-reading-tracker/book-reading-tracker';
  import { pagePath } from '$lib/data/env';
  import {
    barrasDoGrafico,
    diasDaSemana,
    diasDoPeriodo,
    formatarTempo,
    nivelDoDia,
    porLivro,
    sequenciaDeDias,
    somarAoDia,
    somarDias,
    somarPorDia,
    type Dia,
    type Medida,
    type Periodo
  } from '$lib/data/estatisticas/inicio';
  import {
    capasDosLivros,
    linhasDeLeitura,
    ultimoLivro,
    type UltimoLivro
  } from '$lib/data/estatisticas/carregar';
  import { registroDoAnki, type PalavraDoRegistro } from '$lib/data/estatisticas/anki';
  import { getReadingGoalWindow } from '$lib/data/reading-goal';
  import { database, readingGoal$, startDayHoursForTracker$ } from '$lib/data/store';
  import {
    cartasRecebidas$,
    estatisticasRecebidas$,
    sincronizador,
    vocabMudou$
  } from '$lib/data/supabase/sincronizacao/iniciar';
  import {
    barrasDeConhecidas,
    conhecidasPorDia,
    type RetratoDoDia
  } from '$lib/data/estatisticas/palavras';
  import { contarRetrato } from '$lib/data/vocabulario/hub';
  import { coberturasPorTitulo } from '$lib/data/vocabulario/servico';
  import { perfilPronto$ } from '$lib/data/vocabulario/perfis';
  import { formatPageTitle } from '$lib/functions/format-page-title';
  import { getDateKey } from '$lib/functions/statistic-util';

  // Tela Início (ESCOPO "Tela inicial"; desenho do D1, refeito em 25/10): meta em anel com a
  // sequência de dias, resumo da semana, "Continuar lendo", calendário da semana com tons pelo
  // tempo lido, progresso de tempo e caracteres somando os aparelhos, lista por livro e o registro
  // das palavras exportadas para o Anki. A aba Palavras (V2.4) mostra as conhecidas do hub.

  const DIAS_CURTOS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
  const DIAS_LONGOS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

  let porDia = new Map<string, Dia>();
  let primeiroDia: string | undefined;
  let capas = new Map<string, string>();
  let semana = 0;
  let diaEscolhido: string | undefined;
  let medida: Medida | 'palavras' = 'tempo';
  let retratos: RetratoDoDia[] = [];
  let conhecidasAgora = 0;
  let coberturas: { livro: string; valor: number }[] = [];
  let periodo: Periodo = 7;
  let carregado = false;
  let livroAtual: UltimoLivro | undefined;
  let registro: { dia: string; palavras: PalavraDoRegistro[] }[] = [];
  let verTodoRegistro = false;

  const DIAS_DO_REGISTRO = 3;
  const CIRCUNFERENCIA = 2 * Math.PI * 32;

  $: hoje = getDateKey($startDayHoursForTracker$);
  $: dias = diasDaSemana(hoje, semana);
  $: primeiroRetrato = retratos.reduce<string | undefined>(
    (menor, r) => (!menor || r.dia < menor ? r.dia : menor),
    undefined
  );
  $: diasDoFiltro = diasDoPeriodo(
    hoje,
    periodo,
    medida === 'palavras' ? primeiroRetrato : primeiroDia
  );
  $: total = medida === 'palavras' ? conhecidasAgora : somarDias(porDia, diasDoFiltro)[medida];
  $: barras =
    medida === 'palavras'
      ? barrasDeConhecidas(
          diasDoFiltro,
          conhecidasPorDia(retratos, diasDoFiltro, hoje, conhecidasAgora)
        )
      : barrasDoGrafico(porDia, diasDoFiltro, medida);
  $: maiorBarra = Math.max(1, ...barras.map((barra) => barra.valor));
  $: livros = medida === 'palavras' ? coberturas : porLivro(porDia, diasDoFiltro, medida);
  $: maiorLivro = medida === 'palavras' ? 100 : livros[0]?.valor || 1;
  $: meta = $readingGoal$;
  $: janela = meta?.goalStartDate
    ? getReadingGoalWindow(hoje, $startDayHoursForTracker$, meta)
    : [hoje, hoje, ''];
  $: diasDaMeta = diasDoPeriodo(janela[1], 'tudo', janela[0]);
  $: feitoNaMeta = somarDias(porDia, diasDaMeta);
  $: temMeta = !!meta && (meta.timeGoal > 0 || meta.characterGoal > 0);
  $: metaPorTempo = !!meta?.timeGoal;
  $: feito = metaPorTempo ? feitoNaMeta.tempo : feitoNaMeta.caracteres;
  $: alvo = (metaPorTempo ? meta?.timeGoal : meta?.characterGoal) || 1;
  $: batida = temMeta && feito >= alvo;
  $: diferenca = metaPorTempo
    ? formatarTempo(Math.abs(feito - alvo))
    : `${Math.abs(feito - alvo).toLocaleString('pt-BR')} caracteres`;
  $: sequencia = sequenciaDeDias(porDia, hoje);
  $: estaSemana = diasDaSemana(hoje, 0);
  $: semanaLida = somarDias(porDia, estaSemana);
  $: aoAnkiNaSemana = registro
    .filter(({ dia }) => estaSemana.includes(dia))
    .reduce((soma, { palavras }) => soma + palavras.length, 0);
  $: registroVisivel = verTodoRegistro ? registro : registro.slice(0, DIAS_DO_REGISTRO);
  $: nomeDaMeta =
    meta?.goalFrequency === ReadingGoalFrequency.WEEKLY
      ? 'da semana'
      : meta?.goalFrequency === ReadingGoalFrequency.MONTHLY
        ? 'do mês'
        : 'de hoje';
  $: semanaTexto =
    semana === 0
      ? 'Esta semana'
      : semana === -1
        ? 'Semana passada'
        : `${dataCurta(dias[0])} a ${dataCurta(dias[6])}`;

  const formatar = (valor: number, qual: Medida | 'palavras') =>
    qual === 'tempo' ? formatarTempo(valor) : `${valor.toLocaleString('pt-BR')}`;

  async function carregarPalavras() {
    const [linhas, doHistorico, porTitulo] = await Promise.all([
      sincronizador().listar('vocab'),
      sincronizador().listar('retratos'),
      coberturasPorTitulo()
    ]);

    conhecidasAgora = contarRetrato(linhas).known_count;
    retratos = doHistorico.map((r) => ({
      dia: getDateKey($startDayHoursForTracker$, new Date(r.synced_at)),
      quando: r.synced_at,
      conhecidas: r.known_count
    }));
    coberturas = [...porTitulo]
      .map(([livro, { porcentagem }]) => ({ livro, valor: porcentagem }))
      .sort((x, y) => y.valor - x.valor);
  }

  async function carregarRegistro() {
    const [cartas, lotes, titulos] = await Promise.all([
      sincronizador().listar('cartas'),
      sincronizador().listar('lotes'),
      sincronizador().titulosDosLivros()
    ]);

    registro = registroDoAnki(cartas, lotes, titulos, (quando) =>
      getDateKey($startDayHoursForTracker$, new Date(quando))
    );
  }

  function nomeDoDia(dia: string) {
    if (dia === hoje) return 'Hoje';
    if (dia === somarAoDia(hoje, -1)) return 'Ontem';

    const diaDaSemana = (new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7;

    return `${DIAS_LONGOS[diaDaSemana]}, ${dataCurta(dia)}`;
  }

  function dataCurta(dia: string) {
    const [, mes, d] = dia.split('-');

    return `${d}/${mes}`;
  }

  async function carregar() {
    const linhas = await linhasDeLeitura();

    porDia = somarPorDia(linhas);
    primeiroDia = linhas.reduce<string | undefined>(
      (menor, linha) => (!menor || linha.dia < menor ? linha.dia : menor),
      undefined
    );
    carregado = true;
  }

  onMount(() => {
    const assinaturas = [
      estatisticasRecebidas$.subscribe(carregar),
      database.mudou$.subscribe(carregar),
      vocabMudou$.subscribe(carregarPalavras),
      perfilPronto$.subscribe(carregarPalavras),
      cartasRecebidas$.subscribe(carregarRegistro)
    ];

    carregar();
    carregarPalavras();
    carregarRegistro();
    ultimoLivro().then((achado) => (livroAtual = achado));
    capasDosLivros().then((achadas) => (capas = achadas));

    return () => assinaturas.forEach((assinatura) => assinatura.unsubscribe());
  });

  onDestroy(() => capas.forEach((url) => URL.revokeObjectURL(url)));
</script>

<svelte:head>
  <title>{formatPageTitle('Início')}</title>
</svelte:head>

<main class="dokusho-inicio">
  <header>
    <h1>Início</h1>
    <a href="{pagePath}/settings" aria-label="Configurações" class="dokusho-inicio__icone">⚙</a>
  </header>

  <section class="dokusho-cartao dokusho-inicio__meta">
    {#if temMeta}
      <svg
        class="dokusho-inicio__anel"
        class:batida
        viewBox="0 0 80 80"
        role="img"
        aria-label="Meta {nomeDaMeta}: {Math.round((100 * feito) / alvo)}%"
      >
        <circle cx="40" cy="40" r="32" />
        <circle
          cx="40"
          cy="40"
          r="32"
          stroke-dasharray={CIRCUNFERENCIA}
          stroke-dashoffset={CIRCUNFERENCIA * (1 - Math.min(1, feito / alvo))}
          transform="rotate(-90 40 40)"
        />
        <text x="40" y="40" text-anchor="middle"
          >{metaPorTempo ? Math.round(feito / 60) : Math.round(feito / 1000)}</text
        >
        <text x="40" y="55" text-anchor="middle" class="dokusho-inicio__anel-de"
          >de {metaPorTempo
            ? `${Math.round(alvo / 60)} min`
            : `${Math.round(alvo / 1000)} mil`}</text
        >
      </svg>
    {/if}
    <div class="dokusho-inicio__meta-texto">
      <div class="dokusho-inicio__meta-cabeca">
        <small>{temMeta ? `Meta ${nomeDaMeta}` : 'Sem meta'}</small>
        <a href="{pagePath}/settings?aba=Statistics">{temMeta ? 'Editar' : 'Definir meta'}</a>
      </div>
      {#if temMeta}
        <b class:batida>
          {#if batida}
            Meta batida{feito > alvo ? ` · +${diferenca}` : ''}
          {:else}
            Faltam {diferenca}
          {/if}
        </b>
        {#if metaPorTempo && meta?.characterGoal}
          <small
            >{feitoNaMeta.caracteres.toLocaleString('pt-BR')} de
            {meta.characterGoal.toLocaleString('pt-BR')} caracteres</small
          >
        {/if}
      {/if}
      {#if sequencia}
        <span class="dokusho-inicio__sequencia">
          <svg viewBox="0 0 24 24" aria-hidden="true"
            ><path
              d="M12 22c4 0 7-2.7 7-7 0-3.5-2.5-6-4-8-.5 2-1.5 3-3 3 0-3-1-6-4-8 0 4-4 7-4 12 0 4.3 3 8 8 8z"
            /></svg
          >
          {sequencia}
          {sequencia === 1 ? 'dia' : 'dias seguidos'}
        </span>
      {/if}
    </div>
  </section>

  <div class="dokusho-inicio__resumo">
    <div>
      <b>{formatarTempo(porDia.get(hoje)?.tempo ?? 0)}</b>
      <small>lidos hoje</small>
    </div>
    <div>
      <b>{semanaLida.caracteres.toLocaleString('pt-BR')}</b>
      <small>caracteres na semana</small>
    </div>
    <div>
      <b>{aoAnkiNaSemana}</b>
      <small>{aoAnkiNaSemana === 1 ? 'palavra' : 'palavras'} ao Anki</small>
    </div>
  </div>

  {#if livroAtual}
    <a class="dokusho-cartao dokusho-inicio__continuar" href="{pagePath}/b?id={livroAtual.id}">
      {#if capas.get(livroAtual.titulo)}
        <img src={capas.get(livroAtual.titulo)} alt="" />
      {:else}
        <span class="dokusho-inicio__sem-capa" />
      {/if}
      <div>
        <small>Continuar lendo</small>
        <div class="dokusho-inicio__titulo">{livroAtual.titulo}</div>
        <div class="dokusho-inicio__parte"><i style:width="{livroAtual.porcentagem}%" /></div>
      </div>
      <span class="dokusho-inicio__porcentagem">{livroAtual.porcentagem}%</span>
    </a>
  {/if}

  <section class="dokusho-cartao">
    <div class="dokusho-inicio__semana-cabeca">
      <button aria-label="Semana anterior" on:click={() => (semana -= 1)}>‹</button>
      <div>
        <b>{semanaTexto}</b>
        <small>{dataCurta(dias[0])} a {dataCurta(dias[6])}</small>
      </div>
      <button aria-label="Próxima semana" disabled={semana >= 0} on:click={() => (semana += 1)}
        >›</button
      >
    </div>
    <div class="dokusho-inicio__semana">
      {#each dias as dia, i}
        <div>
          <small>{DIAS_CURTOS[i]}</small>
          <button
            class="nivel-{nivelDoDia(porDia.get(dia))}"
            class:hoje={dia === hoje}
            class:escolhido={dia === diaEscolhido}
            disabled={dia > hoje}
            aria-label="{DIAS_LONGOS[i]} {dataCurta(dia)}"
            on:click={() => (diaEscolhido = diaEscolhido === dia ? undefined : dia)}
          >
            {Number(dia.slice(8))}
          </button>
        </div>
      {/each}
    </div>
    {#if diaEscolhido}
      {@const escolhido = porDia.get(diaEscolhido)}
      <p class="dokusho-inicio__detalhe">
        {DIAS_LONGOS[dias.indexOf(diaEscolhido)] ?? ''}, {dataCurta(diaEscolhido)} ·
        {#if escolhido && (escolhido.tempo || escolhido.caracteres)}
          {formatarTempo(escolhido.tempo)} · {escolhido.caracteres.toLocaleString('pt-BR')} caracteres
        {:else}
          sem leitura
        {/if}
      </p>
    {/if}
  </section>

  <section>
    <h2>Progresso de leitura</h2>
    <div class="dokusho-abas">
      <button class:ativa={medida === 'tempo'} on:click={() => (medida = 'tempo')}>Tempo</button>
      <button class:ativa={medida === 'caracteres'} on:click={() => (medida = 'caracteres')}
        >Caracteres</button
      >
      <button class:ativa={medida === 'palavras'} on:click={() => (medida = 'palavras')}
        >Palavras</button
      >
    </div>
    {#if medida === 'palavras'}
      <p class="dokusho-inicio__total">
        <b>{formatar(total, medida)}</b> palavras conhecidas
      </p>
    {:else}
      <p class="dokusho-inicio__total">
        <b>{formatar(total, medida)}</b>
        {medida === 'caracteres' ? 'caracteres ' : ''}{periodo === 'tudo'
          ? primeiroDia
            ? `desde ${dataCurta(primeiroDia)}`
            : ''
          : `nos últimos ${periodo} dias`}
      </p>
    {/if}
    <div class="dokusho-cartao">
      <svg class="dokusho-inicio__grafico" viewBox="0 0 320 110" role="img" aria-label="Gráfico">
        {#each barras as barra, i}
          {@const largura = 320 / barras.length}
          {@const altura = (90 * barra.valor) / maiorBarra}
          <rect
            x={i * largura + largura * 0.15}
            y={95 - altura}
            width={largura * 0.7}
            height={altura}
            rx="2"
            class:hoje={barra.rotulo === hoje}
          >
            <title>{dataCurta(barra.rotulo)}: {formatar(barra.valor, medida)}</title>
          </rect>
        {/each}
        <line x1="0" y1="95.5" x2="320" y2="95.5" />
        {#if barras.length}
          <text x="0" y="108">{dataCurta(barras[0].rotulo)}</text>
          <text x="320" y="108" text-anchor="end"
            >{dataCurta(barras[barras.length - 1].rotulo)}</text
          >
        {/if}
      </svg>
    </div>
    <div class="dokusho-abas">
      <button class:ativa={periodo === 7} on:click={() => (periodo = 7)}>7 dias</button>
      <button class:ativa={periodo === 30} on:click={() => (periodo = 30)}>30 dias</button>
      <button class:ativa={periodo === 'tudo'} on:click={() => (periodo = 'tudo')}>Tudo</button>
    </div>
  </section>

  <section>
    <h2>{medida === 'palavras' ? 'Cobertura por livro' : 'Por livro'}</h2>
    {#each livros as { livro, valor }}
      <div class="dokusho-inicio__livro">
        {#if capas.get(livro)}
          <img src={capas.get(livro)} alt="" />
        {:else}
          <span class="dokusho-inicio__sem-capa" />
        {/if}
        <div>
          <div class="dokusho-inicio__titulo">{livro}</div>
          <div class="dokusho-inicio__parte"><i style:width="{(100 * valor) / maiorLivro}%" /></div>
        </div>
        <small>{medida === 'palavras' ? `${valor}%` : formatar(valor, medida)}</small>
      </div>
    {:else}
      <p class="dokusho-inicio__vazio">
        {#if medida === 'palavras'}
          A cobertura aparece depois de abrir o livro no Leitor.
        {:else}
          {carregado ? 'Nada lido neste período.' : 'Carregando…'}
        {/if}
      </p>
    {/each}
  </section>

  {#if registro.length}
    <section>
      <h2>Adicionadas ao Anki</h2>
      <div class="dokusho-cartao dokusho-inicio__registro">
        {#each registroVisivel as { dia, palavras } (dia)}
          <h3>{nomeDoDia(dia)} · {palavras.length}</h3>
          {#each palavras as palavra (palavra.id)}
            <div class="dokusho-inicio__palavra">
              <ruby lang="ja"
                >{palavra.palavra}{#if palavra.leitura !== palavra.palavra}<rt>{palavra.leitura}</rt
                  >{/if}</ruby
              >
              <div>
                <div class="dokusho-inicio__titulo">{palavra.significado ?? ''}</div>
                {#if palavra.livro}<small>{palavra.livro}</small>{/if}
              </div>
            </div>
          {/each}
        {/each}
        {#if registro.length > DIAS_DO_REGISTRO}
          <button
            class="dokusho-inicio__ver-todas"
            on:click={() => (verTodoRegistro = !verTodoRegistro)}
          >
            {verTodoRegistro ? 'Mostrar menos' : 'Ver todas'}
          </button>
        {/if}
      </div>
    </section>
  {/if}
</main>

<NavegacaoInferior />

<style lang="scss">
  .dokusho-inicio {
    max-width: 640px;
    overflow-x: clip;
    margin: 0 auto;
    padding: 0 18px calc(96px + env(safe-area-inset-bottom, 0px));
    font-family: 'Noto Sans JP', system-ui, sans-serif;
    color: var(--dk-ink);

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 22px 0 10px;
    }

    h1 {
      font-size: 28px;
      font-weight: 700;
    }

    h2 {
      margin: 22px 0 10px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--dk-ink2);
    }
  }

  .dokusho-inicio__icone {
    font-size: 22px;
    padding: 8px;
    color: var(--dk-ink2);
  }

  .dokusho-cartao {
    background: var(--dk-surface);
    border-radius: 16px;
    padding: 14px;
    margin-top: 12px;
    box-shadow: 0 1px 3px var(--dk-shadow);
  }

  .dokusho-inicio__semana-cabeca {
    display: flex;
    align-items: center;
    justify-content: space-between;
    text-align: center;

    button {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      font-size: 24px;

      &:disabled {
        opacity: 0.3;
      }
    }

    small {
      display: block;
      color: var(--dk-ink3);
    }
  }

  .dokusho-inicio__semana {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
    text-align: center;
    margin-top: 10px;

    small {
      font-size: 12px;
      color: var(--dk-ink3);
    }

    button {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      margin: 4px auto 0;
      border-radius: 50%;
      font-size: 14px;
      box-shadow: inset 0 0 0 1.5px var(--dk-line);

      &.nivel-1,
      &.nivel-2,
      &.nivel-3,
      &.nivel-4 {
        box-shadow: none;
      }

      &.nivel-1 {
        background: color-mix(in srgb, var(--dk-accent) 25%, var(--dk-surface));
      }

      &.nivel-2 {
        background: color-mix(in srgb, var(--dk-accent) 48%, var(--dk-surface));
      }

      &.nivel-3 {
        background: color-mix(in srgb, var(--dk-accent) 74%, var(--dk-surface));
        color: var(--dk-accent-ink);
      }

      &.nivel-4 {
        background: var(--dk-accent);
        color: var(--dk-accent-ink);
      }

      &.hoje {
        outline: 2px solid var(--dk-accent);
        outline-offset: 2px;
      }

      &.escolhido {
        outline: 2px dashed var(--dk-ink3);
        outline-offset: 3px;
      }

      &:disabled {
        opacity: 0.4;
      }
    }
  }

  .dokusho-inicio__detalhe {
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--dk-sunk);
    font-size: 14px;
  }

  .dokusho-inicio__meta {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 4px;
  }

  .dokusho-inicio__anel {
    flex: none;
    width: 80px;
    height: 80px;

    circle {
      fill: none;
      stroke-width: 8;
      stroke: var(--dk-sunk);

      + circle {
        stroke: var(--dk-accent);
        stroke-linecap: round;
        transition: stroke-dashoffset 0.4s ease;
      }
    }

    &.batida circle + circle {
      stroke: var(--dk-read);
    }

    text {
      font-size: 20px;
      font-weight: 700;
      fill: var(--dk-ink);
    }

    .dokusho-inicio__anel-de {
      font-size: 10px;
      font-weight: 400;
      fill: var(--dk-ink2);
    }
  }

  .dokusho-inicio__meta-texto {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;

    small {
      color: var(--dk-ink2);
    }

    b {
      font-size: 17px;
      font-weight: 700;

      &.batida {
        color: var(--dk-read);
      }
    }
  }

  .dokusho-inicio__meta-cabeca {
    display: flex;
    align-items: center;
    justify-content: space-between;

    a {
      padding: 6px 0 6px 12px;
      font-size: 14px;
      color: var(--dk-accent);
    }
  }

  .dokusho-inicio__sequencia {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--dk-warn);

    svg {
      width: 16px;
      height: 16px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linejoin: round;
    }
  }

  .dokusho-inicio__resumo {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-top: 10px;

    > div {
      background: var(--dk-surface);
      border-radius: 14px;
      padding: 12px;
      box-shadow: 0 1px 3px var(--dk-shadow);
    }

    b {
      display: block;
      font-size: 18px;
      font-weight: 700;
    }

    small {
      font-size: 12px;
      color: var(--dk-ink2);
    }
  }

  .dokusho-inicio__continuar {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto;
    gap: 14px;
    align-items: center;

    img,
    .dokusho-inicio__sem-capa {
      width: 40px;
      height: 56px;
      border-radius: 4px;
      object-fit: cover;
      background: var(--dk-line);
    }

    small {
      font-size: 12px;
      color: var(--dk-ink2);
    }

    .dokusho-inicio__parte {
      margin-top: 8px;

      i {
        opacity: 1;
      }
    }
  }

  .dokusho-inicio__porcentagem {
    font-size: 14px;
    font-weight: 700;
    color: var(--dk-accent);
  }

  .dokusho-inicio__registro {
    padding-top: 2px;

    h3 {
      padding: 12px 0 2px;
      font-size: 12px;
      font-weight: 700;
      color: var(--dk-ink2);
    }

    small {
      font-size: 12px;
      color: var(--dk-ink3);
    }
  }

  .dokusho-inicio__palavra {
    display: grid;
    grid-template-columns: minmax(64px, auto) minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--dk-line);

    ruby {
      font-size: 19px;
      font-weight: 500;
      ruby-align: center;
    }

    rt {
      font-size: 10px;
      color: var(--dk-ink2);
    }
  }

  .dokusho-inicio__ver-todas {
    width: 100%;
    min-height: 44px;
    font-size: 14px;
    color: var(--dk-accent);
  }

  .dokusho-inicio__parte {
    height: 4px;
    border-radius: 2px;
    background: var(--dk-sunk);
    overflow: hidden;
    margin-top: 6px;

    i {
      display: block;
      height: 100%;
      background: var(--dk-accent);
      opacity: 0.55;
    }
  }

  .dokusho-abas {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 11px;
    background: var(--dk-sunk);
    margin-top: 10px;

    button {
      flex: 1;
      min-height: 34px;
      border-radius: 9px;
      font-size: 14px;
      color: var(--dk-ink2);

      &.ativa {
        background: var(--dk-surface);
        color: var(--dk-ink);
        box-shadow: 0 1px 3px var(--dk-shadow);
      }

      &:disabled {
        opacity: 0.45;
      }
    }
  }

  .dokusho-inicio__total {
    margin: 14px 0 4px;
    color: var(--dk-ink2);

    b {
      font-size: 30px;
      color: var(--dk-ink);
      margin-right: 6px;
    }
  }

  .dokusho-inicio__grafico {
    width: 100%;
    height: auto;

    rect {
      fill: var(--dk-accent);

      &.hoje {
        fill: var(--dk-read);
      }
    }

    line {
      stroke: var(--dk-line);
    }

    text {
      font-size: 10px;
      fill: var(--dk-ink3);
    }
  }

  .dokusho-inicio__livro {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    margin-bottom: 12px;

    img,
    .dokusho-inicio__sem-capa {
      width: 34px;
      height: 48px;
      border-radius: 4px;
      object-fit: cover;
      background: var(--dk-line);
    }

    small {
      color: var(--dk-ink2);
    }
  }

  .dokusho-inicio__titulo {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dokusho-inicio__vazio {
    padding: 28px 10px;
    text-align: center;
    color: var(--dk-ink3);
    font-size: 14px;
  }
</style>

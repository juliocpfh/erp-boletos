// FORMULARIOS: o que acontece ao enviar cada formulário (data-form="nome"). O de cadastro genérico é FORMULARIOS.cadastro.
import { alterar, aviso, backupCompletoSeguro, baixar, conectarSeguro, criarBanco, E, entrar, excelJs, ir, janela, jsZip, login, mostrar, podeUsuario, renovarUsuario } from '../app.js';
import * as S from '../armazenamento.js';
import { conferirSenha, novoSal, resumoSenha } from '../auth.js';
import * as B from '../backup-seguro.js';
import * as C from '../calculos.js';
import { compBr, dataBr, pct, reais } from '../calculos.js';
import * as K from '../contratos.js';
import * as F from '../formularios.js';
import * as R from '../regras.js';
import { aplicarReajusteNaTela } from './acoes.js';
import { reduzirImagem } from './admin.js';
import { confirmarAvisos, dataMuitoAntiga, dataNoFuturo } from './avisos.js';
import { CADASTROS, nomeComprovante } from './cadastros.js';
import { apagarRascunhoVistoria } from './campos.js';
import { acertarNomesDosComprovantes, buscar, d, memoria, pastaDoEscopo, salvarAssinado, trazerHerancaAssinada } from './comum.js';
import { modelosNoBanco, reduzirFoto } from './documentos.js';

export const FORMULARIOS = {
  async configurarSeguro(form) {
    if (!podeUsuario('admin')) throw new Error('Só o administrador configura o backup seguro.');
    const dir = E.pastaSeguraNova;
    if (!dir) throw new Error('Escolha a pasta segura primeiro.');
    const f = new FormData(form);
    const senha = String(f.get('senha') || '');
    let chave = await B.lerChave(dir);
    if (chave) {
      if (!(await B.conferirSenha(chave, senha))) throw new Error('Senha do backup incorreta.');
    } else {
      if (senha !== String(f.get('senha2') || '')) throw new Error('As duas senhas precisam ser iguais.');
      chave = await B.criarChave(senha);
      await B.gravarChave(dir, chave);
    }
    await S.lembrarPastaSegura(dir);
    E.pastaSeguraNova = null;
    await conectarSeguro(false);
    await alterar((db) => R.registrar(db, login(), 'Alteração', 'banco', null, 'Backup seguro ligado neste computador', null, {}, false));
    await backupCompletoSeguro();
    aviso('Backup seguro ligado. Primeiro backup completo gravado.');
    await mostrar();
  },

  async restaurarSeguro(form) {
    const f = new FormData(form);
    const arq = f.get('arquivo');
    if (!arq || !arq.size) throw new Error('Escolha o arquivo de backup.');
    const { info, dados } = await B.decifrar(await arq.arrayBuffer(), String(f.get('senha') || ''));
    const data = (info.criado_em || '').slice(0, 10);
    let blob;
    if (info.tipo === 'completo') blob = new Blob([dados], { type: 'application/zip' });
    else {
      const JSZip = await jsZip();
      const zip = new JSZip();
      zip.file(S.ARQUIVO_BANCO, dados);
      blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    }
    baixar(blob, `backup-restaurado-${info.tipo === 'completo' ? 'completo' : 'banco'}-${data}.zip`);
    aviso(`Backup de ${new Date(info.criado_em).toLocaleString('pt-BR')} aberto. Agora use "Importar ZIP" em Dados e backup com o arquivo baixado.`);
  },

  async modeloVistoria(form) {
    const f = Object.fromEntries(new FormData(form));
    const i = buscar('imoveis', f.imovel);
    await alterar((db) => R.atualizar(db, 'imoveis', i.id, { modelo_vistoria: String(f.modelo || '').trim() }, login(), `${i.nome}: modelo de vistoria`));
    aviso('Modelo de vistoria salvo.');
    ir(/^#\/vistoria\//.test(f.voltar || '') ? f.voltar : `#/imovel/${i.id}`);
  },

  async baixaLote(form) {
    const fd = new FormData(form);
    const data = String(fd.get('data') || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Informe a data em que o dinheiro entrou.');
    const ids = fd.getAll('ids').map(Number);
    if (!ids.length) throw new Error('Marque os boletos deste vencimento que foram pagos.');
    const vencs = new Set(ids.map((id) => (buscar('cobrancas', id) || {}).vencimento));
    if (vencs.size > 1) throw new Error('Confirme juntos só boletos do mesmo vencimento.');
    confirmarAvisos([dataNoFuturo(data), dataMuitoAntiga(data)].filter(Boolean));
    let r;
    await alterar((db) => { r = R.baixarEmLote(db, ids, data, login()); });
    aviso(`${r.feitos.length} pagamento(s) confirmado(s) em dia, com entrada em ${dataBr(data)}.${r.pulados.length ? ` ${r.pulados.length} já estavam pagos ou em carência e ficaram como estavam.` : ''}`);
    await mostrar();
  },

  async lancarContas(form) {
    const f = Object.fromEntries(new FormData(form));
    const linhas = R.TIPOS_DESPESA.map((t, n) => {
      const texto = String(f[`valor_${n}`] || '').trim();
      return { tipo: f[`tipo_${n}`], valor: texto ? C.centavos(texto) : null, data_pagamento: f[`data_${n}`], observacoes: String(f[`obs_${n}`] || '').trim() };
    });
    if (!f.competencia) throw new Error('Informe o mês da conta.');
    let n = 0;
    await alterar((db) => { n = R.lancarDespesas(db, Number(f.imovel), f.competencia, linhas, login()).length; });
    aviso(`${n} conta(s) lançada(s).`);
    await mostrar();
  },

  async marcarDocumento(form) {
    const f = Object.fromEntries(new FormData(form));
    if (!f.data) throw new Error('Informe a data.');
    const doc = R.DOCUMENTOS_ENTRADA.find(([k]) => k === f.campo);
    const arquivo = form.querySelector('[name=arquivo]').files[0];
    if (!arquivo) throw new Error(`Anexe o arquivo de "${doc[1]}" ${doc[2]} antes de marcar.`);
    const nome = await salvarAssinado('assinados', Number(f.contrato), arquivo, `${doc[1]} ${doc[2]} ${f.data}`);
    await alterar((db) => R.marcarDocumento(db, Number(f.contrato), f.campo, f.data, login(), nome));
    await mostrar();
  },

  /** Rotina de entrada: marca a etapa como feita na data escolhida. */
  async etapaEntrada(form) {
    const f = Object.fromEntries(new FormData(form));
    if (!f.data) throw new Error('Informe a data.');
    await alterar((db) => R.marcarEtapaEntrada(db, Number(f.contrato), f.chave, { data: f.data }, login()));
    await mostrar();
  },

  /** Um depósito da caução ou do depósito de garantia (pode ser parcelado): data, valor e comprovante, gravado na pasta do inquilino. */
  async garantiaPaga(form) {
    const f = Object.fromEntries(new FormData(form));
    const arq = form.querySelector('[name=arquivo]').files[0];
    const g = R.GARANTIAS_DEPOSITADAS[f.qual];
    const valor = C.centavos(f.valor);
    // confere antes de gravar o arquivo na pasta (as mesmas mensagens de R.registrarDepositoGarantia); o comprovante pode vir depois
    if (!f.data) throw new Error('Informe a data do depósito.');
    if (!(valor > 0)) throw new Error('Informe o valor depositado.');
    const nome = arq ? await S.salvarArquivo(await pastaDoEscopo('contrato', Number(f.contrato)), new File([arq], nomeComprovante(g.arquivo, f.data, arq))) : null;
    let s;
    await alterar((db) => { s = R.registrarDepositoGarantia(db, Number(f.contrato), f.qual, { data: f.data, valor, arquivo: nome }, login()); });
    aviso(`${s.completou ? `Depósito de ${reais(valor)} registrado: ${g.nome} registrada.${s.falta > 0 ? ` Falta o complemento dos reajustes: ${reais(s.falta)}.` : ''}`
      : s.falta > 0 ? `Depósito de ${reais(valor)} registrado. Já depositado ${reais(s.depositado)}; falta ${reais(s.falta)}.` : `Depósito de ${reais(valor)} registrado: ${g.nome} completa (${reais(s.depositado)}).`}${nome ? '' : ' Sem comprovante: fica o aviso até anexar.'}`);
    await mostrar();
  },

  async aditivo(form) {
    const f = Object.fromEntries(new FormData(form));
    const arquivo = form.querySelector('[name=arquivo]').files[0];
    // confere antes de gravar o arquivo na pasta (as mesmas mensagens de R.registrarAditivo)
    if (!f.data) throw new Error('Informe a data do termo aditivo.');
    if (!String(f.assunto || '').trim()) throw new Error('Informe o assunto do termo aditivo (ex.: troca do dia do vencimento).');
    if (!arquivo) throw new Error('Anexe o arquivo do termo aditivo assinado.');
    const nome = await salvarAssinado('aditivos', Number(f.contrato), arquivo, `termo aditivo ${f.data} ${f.assunto}`.slice(0, 80));
    await alterar((db) => R.registrarAditivo(db, Number(f.contrato), { data: f.data, assunto: f.assunto, arquivo: nome }, login()));
    await trazerHerancaAssinada(Number(f.contrato));
    aviso('Termo aditivo registrado.');
    await mostrar();
  },

  async vistoria(form) {
    const f = Object.fromEntries(new FormData(form));
    if (!f.data) throw new Error('Informe a data da vistoria.');
    const c = buscar('contratos', f.contrato);
    // leitura dos relógios: obrigatória e registrada aqui (entrada ou saída do inquilino)
    const momento = f.tipo === 'Saída' ? 'Saída do inquilino' : 'Entrada do inquilino';
    const leitura = Object.fromEntries(F.LEITURAS.map(([k]) => [k, String(f[`leitura_${k}`] || '').trim()]));
    const faltaLeitura = R.relogiosDoContrato(c).filter((k) => !leitura[k]);
    if (faltaLeitura.length) throw new Error(`Informe a leitura do relógio de ${faltaLeitura.map((k) => F.LEITURAS.find(([x]) => x === k)[1].replace('Relógio de ', '')).join(' e ')}.`);
    const dados = { contrato_id: c.id, imovel_id: c.imovel_id || null, tipo: f.tipo, data: f.data, link_fotos: (f.link_fotos || '').trim(),
      chaves: f.chaves || '', descritivo: f.descritivo || '', condicoes: f.condicoes || '',
      texto_abertura: String(f.texto_abertura || '').trim(), texto_final: f.tipo === 'Entrada' ? String(f.texto_final || '').trim() : '' };
    // texto igual ao padrão fica em branco: vale o padrão (a abertura muda sozinha com ou sem o link das fotos)
    const semEspacos = (x) => String(x).replace(/\s+/g, ' ').trim();
    if ([K.VISTORIA_ABERTURA, K.VISTORIA_ABERTURA_SEM_LINK].map(semEspacos).includes(semEspacos(dados.texto_abertura))) dados.texto_abertura = '';
    if (semEspacos(dados.texto_final) === semEspacos(K.vistoriaFinal(3))) dados.texto_final = '';
    dados.itens = [];
    for (let n = 0; f[`ic_${n}`] !== undefined; n += 1) dados.itens.push({ comodo: f[`ic_${n}`], item: f[`ii_${n}`], situacao: f[`is_${n}`] || '', obs: String(f[`io_${n}`] || '').trim() });
    // todo item do modelo precisa de situação (o navegador já aponta o primeiro; aqui a lista completa)
    const semSituacao = dados.itens.filter((x) => !x.situacao);
    if (semSituacao.length) throw new Error(`Falta a situação de ${semSituacao.length} item(ns): ${semSituacao.slice(0, 8).map((x) => `${x.comodo} – ${x.item}`).join('; ')}${semSituacao.length > 8 ? '…' : ''}. Marque a situação (ou "Não se aplica") antes de salvar.`);
    const tirados = dados.itens.filter((x) => x.situacao === K.NAO_SE_APLICA);
    dados.itens = dados.itens.filter((x) => x.situacao !== K.NAO_SE_APLICA);
    // fotos: reduzidas e guardadas na pasta do inquilino (mesmo nome = substitui a anterior)
    const anterior = Number(f.id) ? buscar('vistorias', f.id) : null;
    dados.fotos = { ...((anterior && anterior.fotos) || {}) };
    const novasFotos = K.FOTOS_VISTORIA.filter(([k]) => f[`foto_${k}`] && f[`foto_${k}`].size);
    if (novasFotos.length) {
      const dir = await pastaDoEscopo('contrato', c.id);
      for (const [k] of novasFotos) {
        const nome = `vistoria-${f.tipo === 'Saída' ? 'saida' : 'entrada'}-${f.data}-${k}.jpg`;
        await S.escreverTexto(dir, nome, await reduzirFoto(f[`foto_${k}`]));
        dados.fotos[k] = nome;
      }
    }
    if (f.tipo === 'Saída') {
      const entrada = R.vistoriasDo(d(), c.id).find((x) => x.tipo === 'Entrada');
      dados.comparar_com = entrada ? entrada.data : null;
    }
    let id = Number(f.id) || null;
    await alterar((db) => {
      const desc = `${c.inquilino_nome}: vistoria de ${f.tipo.toLocaleLowerCase('pt-BR')}`;
      if (id) R.atualizar(db, 'vistorias', id, dados, login(), desc);
      else id = R.inserir(db, 'vistorias', dados, login(), desc).id;
      R.gravarLeitura(db, c, momento, f.data, leitura, login());
      const im = c.imovel_id && R.buscar(db, 'imoveis', c.imovel_id);
      if (im && tirados.length) {
        const modelo = K.tirarDoModelo(im.modelo_vistoria, tirados);
        if (modelo !== (im.modelo_vistoria || '')) R.atualizar(db, 'imoveis', im.id, { modelo_vistoria: modelo }, login(), `Modelo de vistoria: tirado o que não se aplica (${tirados.map((x) => `${x.comodo} – ${x.item}`).join(', ')})`);
      }
      if (f.atualizar_imovel === '1' && c.imovel_id && dados.chaves.trim()) R.atualizar(db, 'imoveis', c.imovel_id, { chaves: dados.chaves.trim(), sem_chaves: false }, login(), 'Chaves e controles do imóvel');
      if (dados.link_fotos && f.tipo === 'Entrada' && !c.vistoria_link) R.atualizar(db, 'contratos', c.id, { vistoria_link: dados.link_fotos }, login(), `${c.inquilino_nome}: link das fotos da vistoria`);
    });
    apagarRascunhoVistoria(form.dataset.rascunho);
    aviso('Vistoria salva.');
    ir(`#/imprimir/vistoria?id=${id}`);
  },

  gerarContrato(form) {
    const f = Object.fromEntries(new FormData(form));
    try { localStorage.setItem('testemunhas_contrato', JSON.stringify({ t1: f.t1, c1: f.c1, t2: f.t2, c2: f.c2 })); } catch { /* sem lembrar */ }
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== ''));
    ir(`#/imprimir/contrato?${q}`);
  },

  async reservaAbatida(form) {
    const f = Object.fromEntries(new FormData(form));
    const n = await alterar((db) => R.marcarReservaAbatida(db, Number(f.contrato), { competencia: f.competencia, valor: C.centavos(f.valor) }, login()));
    aviso(`Reserva marcada como já abatida${n ? `; saiu de ${n} boleto(s) em aberto` : ''}.`);
    await mostrar();
  },

  async aditivoVencimento(form) {
    const f = Object.fromEntries(new FormData(form));
    try { localStorage.setItem('testemunhas_contrato', JSON.stringify({ t1: f.t1, c1: f.c1, t2: f.t2, c2: f.c2 })); } catch { /* sem lembrar */ }
    const modelo = f.id ? null : K.modelosDe(d(), 'aditivo').find((m) => String(m.id) === f.modelo);
    if (!f.id && !modelo) throw new Error('Escolha o modelo do termo aditivo.');
    const dados = { data: f.data, dia_novo: f.dia_novo, mes: f.mes,
      testemunhas: [[f.t1, f.c1], [f.t2, f.c2]].map(([nome, cpf]) => ({ nome: String(nome || '').trim(), cpf: String(cpf || '').trim() })),
      ...(modelo ? { modelo_id: modelo.id > 0 ? modelo.id : null, texto: modelo.texto } : { texto: f.texto }) };
    let a;
    await alterar((db) => { a = R.salvarAditivoVencimento(db, Number(f.contrato), dados, login(), f.id ? Number(f.id) : null); });
    aviso(f.id ? 'Termo aditivo salvo.' : 'Termo aditivo gerado: imprima ou baixe o PDF para assinar.');
    ir(`#/imprimir/aditivo?id=${a.id}`);
  },

  async aditivoTroca(form) {
    const f = Object.fromEntries(new FormData(form));
    try { localStorage.setItem('testemunhas_contrato', JSON.stringify({ t1: f.t1, c1: f.c1, t2: f.t2, c2: f.c2 })); } catch { /* sem lembrar */ }
    const modelo = f.id ? null : K.modelosDe(d(), 'aditivo_troca').find((m) => String(m.id) === f.modelo);
    if (!f.id && !modelo) throw new Error('Escolha o modelo do termo aditivo.');
    const dados = { data: f.data,
      testemunhas: [[f.t1, f.c1], [f.t2, f.c2]].map(([nome, cpf]) => ({ nome: String(nome || '').trim(), cpf: String(cpf || '').trim() })),
      ...(modelo ? { modelo_id: modelo.id > 0 ? modelo.id : null, texto: modelo.texto } : { texto: f.texto }) };
    let a;
    await alterar((db) => { a = R.salvarAditivoTroca(db, Number(f.contrato), dados, login(), f.id ? Number(f.id) : null); });
    aviso(f.id ? 'Termo aditivo salvo.' : 'Termo aditivo gerado: imprima ou baixe o PDF para assinar.');
    ir(`#/imprimir/aditivo?id=${a.id}`);
  },

  async assinarAditivo(form) {
    const f = Object.fromEntries(new FormData(form));
    const arquivo = form.querySelector('[name=arquivo]').files[0];
    const a = buscar('aditivos', f.id);
    if (!f.data) throw new Error('Informe a data da assinatura.');
    if (!arquivo) throw new Error('Anexe o arquivo do termo aditivo assinado.');
    const nome = await salvarAssinado('aditivos', a.contrato_id, arquivo, `termo aditivo ${f.data} ${a.assunto}`.slice(0, 80));
    await alterar((db) => R.assinarAditivo(db, a.id, { data: f.data, arquivo: nome }, login()));
    await trazerHerancaAssinada(a.contrato_id);
    aviso(a.tipo === K.TIPO_ADITIVO_TROCA ? 'Termo aditivo assinado e registrado.' : 'Termo aditivo assinado e registrado. Lembre de mudar o dia do vencimento no cadastro do inquilino (Editar).');
    await mostrar();
  },

  async modeloContrato(form) {
    const f = new FormData(form);
    const nome = String(f.get('nome') || '').trim();
    const texto = String(f.get('texto') || '');
    if (!nome || !texto.trim()) throw new Error('Preencha o nome e o texto do modelo.');
    const id = Number(f.get('id') || 0);
    const tipo = ['aditivo', 'aditivo_troca'].includes(f.get('tipo')) ? f.get('tipo') : 'contrato';
    await alterar((db) => {
      // o modelo novo não esconde os padrões do mesmo tipo: eles vão para o banco antes
      const real = modelosNoBanco(db, id, tipo);
      if (real) R.atualizar(db, 'modelos_contrato', real, { nome, texto }, login(), `Modelo de contrato "${nome}"`);
      else R.inserir(db, 'modelos_contrato', { nome, texto, ...(tipo !== 'contrato' ? { tipo } : {}) }, login(), `Modelo de contrato "${nome}"`);
    });
    aviso('Modelo salvo.');
    ir('#/modelos-contrato');
  },

  async primeiroAcesso(form) {
    const f = new FormData(form);
    const nome = String(f.get('nome')).trim();
    const lg = String(f.get('login')).trim().toLowerCase();
    const senha = String(f.get('senha'));
    if (!nome || !lg) throw new Error('Preencha nome e login.');
    if (senha.length < 6 || senha !== f.get('senha2')) throw new Error('A senha precisa ter pelo menos 6 caracteres e as duas precisam ser iguais.');
    await criarBanco(nome, lg, senha);
    ir('#/');
  },

  async login(form) {
    const f = new FormData(form);
    await entrar(String(f.get('login')).trim().toLowerCase(), String(f.get('senha')));
    await mostrar();
  },

  async pedirAcesso(form) {
    const f = new FormData(form);
    const nome = String(f.get('nome') || '').trim();
    const lg = String(f.get('login') || '').trim().toLowerCase();
    const senha = String(f.get('senha') || '');
    if (!nome || !lg || /\s/.test(lg)) throw new Error('Preencha o nome e um login sem espaços.');
    if (senha.length < 6 || senha !== f.get('senha2')) throw new Error('A senha precisa ter pelo menos 6 caracteres e as duas precisam ser iguais.');
    if (E.d.usuarios.some((u) => u.login === lg)) throw new Error('Já existe um usuário (ou pedido) com este login.');
    const sal = novoSal();
    const hash = await resumoSenha(senha, sal);
    await alterar((db) => R.inserir(db, 'usuarios', { login: lg, nome, papel: 'consulta', ativo: false, pendente: true, senha_sal: sal, senha_hash: hash,
      criado_em: new Date().toISOString() }, lg, `Pedido de acesso de ${nome}`));
    aviso('Pedido enviado. Assim que o administrador aprovar, entre com o seu login e senha.');
    ir('#/');
  },

  async minhaSenha(form) {
    const f = new FormData(form);
    if (!(await conferirSenha(E.usuario, String(f.get('atual'))))) throw new Error('Senha atual incorreta.');
    const nova = String(f.get('nova'));
    if (nova.length < 6 || nova !== f.get('nova2')) throw new Error('A nova senha precisa ter pelo menos 6 caracteres e as duas precisam ser iguais.');
    const sal = novoSal();
    const hash = await resumoSenha(nova, sal);
    await alterar((db) => R.atualizar(db, 'usuarios', E.usuario.id, { senha_sal: sal, senha_hash: hash }, login(), 'Trocou a própria senha'));
    E.usuario = R.buscar(E.d, 'usuarios', E.usuario.id);
    aviso('Senha alterada.');
    ir('#/');
  },

  async cadastro(form, rota) {
    const tabela = rota.partes[1];
    const cfg = CADASTROS[tabela];
    const registro = rota.partes[0] === 'editar' ? buscar(tabela, rota.partes[2]) : null;
    const antigo = registro ? { ...registro } : null;
    const campos = cfg.campos(registro, rota.q);
    // documentos já salvos (CPF/CNPJ) e que não mudaram não são barrados; "valores" traz também os que aparecem no formulário (ex.: fiadores no contrato)
    const { dados, erros } = F.ler(campos, form, registro && cfg.valores ? cfg.valores(registro) : registro);
    if (cfg.ajustar && !Object.keys(erros).length) cfg.ajustar(dados, erros, registro, form, rota.q);
    if (cfg.confirmar && !Object.keys(erros).length && !(await cfg.confirmar(dados, registro))) throw new Error('Nada foi salvo.');
    if (cfg.ajustarAsync && !Object.keys(erros).length) await cfg.ajustarAsync(dados, erros, registro, form, rota.q);
    if (Object.keys(erros).length) return { erros, valores: Object.fromEntries(new FormData(form)) };
    confirmarAvisos(cfg.conferir ? cfg.conferir(dados, registro, rota.q) : []);
    Object.assign(dados, cfg.fixos ? cfg.fixos(registro, rota.q) : {});
    const descricao = cfg.descricao ? cfg.descricao(dados, registro, rota.q) : null;
    let recalculados = 0;
    const salvo = await alterar((db) => {
      let r;
      if (cfg.salvar) r = cfg.salvar(db, dados, rota.q, registro);
      else if (registro) {
        R.atualizar(db, tabela, registro.id, dados, login(), descricao);
        r = R.buscar(db, tabela, registro.id);
      } else r = R.inserir(db, tabela, dados, login(), descricao);
      // boletos em aberto acompanham o cadastro (contrato, correção, IPTU, seguro)
      if (cfg.recalcular) recalculados = R.recalcularCobrancas(db, cfg.recalcular(r, db), login());
      return r;
    });
    if (cfg.depois) await cfg.depois(salvo, antigo);
    // data do lançamento editada: o nome do comprovante acompanha (comprovante-caucao-AAAA-MM-DD)
    if (['contratos', 'depositos_garantia', 'correcoes_garantia', 'aplicacoes', 'devolucoes_garantia'].includes(tabela)) await acertarNomesDosComprovantes(tabela === 'contratos' ? salvo.id : salvo.contrato_id);
    if (tabela === 'usuarios') renovarUsuario();
    aviso(recalculados ? `Salvo. ${recalculados} boleto(s) em aberto recalculado(s) com os valores novos.` : 'Salvo.');
    const destino = tabela === 'imoveis' ? `#/imovel/${salvo.id}` : cfg.destino ? cfg.destino(salvo, rota.q) : cfg.voltar(salvo, rota.q);
    ir(destino);
    return null;
  },

  async participacao(form) {
    const f = new FormData(form);
    const imovelId = Number(form.dataset.imovel);
    const emitenteId = Number(f.get('emitente_id'));
    const percentual = C.numero(f.get('percentual'));
    if (!(percentual > 0 && percentual <= 100)) throw new Error('Percentual inválido.');
    await alterar((db) => {
      const existente = db.participacoes.find((p) => p.imovel_id === imovelId && p.emitente_id === emitenteId);
      if (existente) R.atualizar(db, 'participacoes', existente.id, { percentual }, login());
      else R.inserir(db, 'participacoes', { imovel_id: imovelId, emitente_id: emitenteId, percentual }, login());
    });
    await mostrar();
  },

  async pagamento(form) {
    const f = new FormData(form);
    const data = String(f.get('data') || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Informe a data do pagamento.');
    const valor = String(f.get('valor') || '').trim() ? C.centavos(f.get('valor')) : null;
    const pagouEmDia = f.get('em_dia') === '1';
    const dataPagou = String(f.get('pagou') || '') || null;
    const cb = buscar('cobrancas', form.dataset.id);
    confirmarAvisos([
      dataNoFuturo(data, 'A data do pagamento'),
      dataMuitoAntiga(data, 'A data do pagamento'),
      cb && data < C.somarDias(cb.vencimento, -40) ? `A data do pagamento (${dataBr(data)}) é bem antes do vencimento (${dataBr(cb.vencimento)}).` : '',
    ].filter(Boolean));
    // valor recebido diferente do previsto: justificativa e, na página do boleto, o valor da NF digitado à mão
    const previsto = cb && R.previstoNoPagamento(cb, data, { pagouEmDia, dataPagou });
    if (cb && valor !== null && valor !== previsto.valor_devido && !R.ehComplementoCaucao(cb) && R.geraNf(buscar('contratos', cb.contrato_id))) {
      if (dataPagou && dataPagou > data) throw new Error('O dia em que pagou não pode ser depois da data contábil.');
      const dif = valor - previsto.valor_devido;
      const resp = await janela({ titulo: 'Valor diferente do previsto',
        html: `<p>Previsto para ${dataBr(pagouEmDia ? cb.vencimento : dataPagou || data)}: <b>${reais(previsto.valor_devido)}</b><br>Recebido: <b>${reais(valor)}</b><br>
          Diferença: <b class="${dif < 0 ? 'negativo' : ''}">${dif > 0 ? '+' : '−'}${reais(Math.abs(dif))}</b></p>
          <p><label>Justificativa da divergência</label><textarea name="justificativa" rows="3" required></textarea></p>
          <p class="suave">Fica só no sistema (não sai na NF nem no boleto). Em seguida, informe o valor da NF na página do boleto.</p>`,
        sim: 'Continuar', nao: 'Cancelar' });
      const justificativa = resp && String((resp.justificativa || [])[0] || '').trim();
      if (!resp) return;
      if (!justificativa) throw new Error('Informe a justificativa da divergência. Nada foi salvo.');
      memoria.pagamentoDivergente = { id: cb.id, data, valor, pagouEmDia, dataPagou, justificativa };
      ir(`#/cobranca/${cb.id}?ir=pagamento`);
      return;
    }
    const r = await alterar((db) => R.registrarPagamento(db, Number(form.dataset.id), data, valor, login(), { pagouEmDia, dataPagou }));
    const pago = buscar('cobrancas', form.dataset.id);
    if (pago && R.ehComplementoCaucao(pago)) aviso(`Complemento da caução pago${r.pontual ? '' : ` com ${r.dias_atraso} dia(s) de atraso`}: a caução passou a ${reais(pago.caucao_nova)}. Sem NF.`, 'ok');
    else aviso(r.pontual ? `Pagamento em dia confirmado${pagouEmDia ? ' (sem multa e juros)' : ''}. Data da NF: ${dataBr(data)}. Valor da nota: ${reais(r.valor_nf)}.`
      : `Pagamento com ${r.dias_atraso} dia(s) de atraso: multa ${reais(r.multa)} e juros ${reais(r.juros)}. Valor da nota: ${reais(r.valor_nf)} (com multa e juros). Data da NF: ${dataBr(data)}.`, r.pontual ? 'ok' : 'aviso');
    await mostrar();
  },

  /** Pagamento com valor diferente do previsto: a NF sai com o valor digitado (diferente do calculado) e a justificativa fica no histórico. */
  async pagamentoNf(form) {
    const p = memoria.pagamentoDivergente;
    if (!p || String(p.id) !== form.dataset.id) throw new Error('Confirme o pagamento de novo.');
    const f = new FormData(form);
    const texto = String(f.get('valor_nf') || '').trim();
    const valorNf = texto ? C.centavos(texto) : null;
    const justificativa = String(f.get('justificativa') || '').trim();
    const r = await alterar((db) => R.registrarPagamento(db, p.id, p.data, p.valor, login(), { pagouEmDia: p.pagouEmDia, dataPagou: p.dataPagou, valorNf, justificativa }));
    memoria.pagamentoDivergente = null;
    aviso(`Pagamento confirmado com valor diferente do previsto. Recebido ${reais(p.valor)}; NF de ${reais(valorNf)} (calculada ${reais(r.valor_nf)}). Data da NF: ${dataBr(p.data)}.`, 'aviso');
    await mostrar();
  },

  async ajuste(form) {
    const f = new FormData(form);
    const valor = Math.abs(C.centavos(String(f.get('valor') || '').trim()));
    if (!valor) throw new Error('Informe o valor do ajuste.');
    const motivo = String(f.get('motivo') || '').trim();
    if (!motivo) throw new Error('Informe o motivo do ajuste (fica no histórico).');
    await alterar((db) => R.ajustarBoleto(db, Number(form.dataset.id), f.get('tipo') === 'ressarcimento' ? -valor : valor, motivo, login()));
    aviso('Ajuste salvo e registrado no histórico.');
    await mostrar();
  },

  async iptuPago(form) {
    const data = String(new FormData(form).get('data') || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Informe a data do pagamento.');
    await alterar((db) => R.marcarIptuPago(db, Number(form.dataset.id), Number(form.dataset.n), data, login()));
    aviso('Parcela do IPTU marcada como paga.');
    await mostrar();
  },

  async desfazerNumeracao(form) {
    const n = Number(new FormData(form).get('numero'));
    if (!confirm(`Desfazer a numeração a partir da NF nº ${R.numeroFatura(n)}? Todas as NFs com este número ou maior saem da lista (ficam no Histórico), os pagamentos voltam para a fila e o próximo número volta a ser ${R.numeroFatura(n)}.`)) return;
    const qtd = await alterar((db) => R.desfazerNumeracao(db, n, login()));
    aviso(`${qtd} número(s) desfeito(s). Corrija o que precisar e clique em "Numerar estas NFs".`);
    await mostrar();
  },
  async nfExterna(form) {
    const f = new FormData(form);
    const n = await alterar((db) => R.registrarNfExterna(db, form.dataset.tipo, Number(form.dataset.id), f.get('numero'), String(f.get('emissao') || ''), login()));
    aviso(`NF nº ${R.numeroFatura(n)} registrada (emitida fora do sistema).`);
    await mostrar();
  },

  async indiceAcumulado(form) {
    const f = new FormData(form);
    const indice = String(f.get('indice') || '');
    const mesRef = String(f.get('mes_ref') || '');
    if (!/^\d{4}-\d{2}$/.test(mesRef)) throw new Error('Informe o mês até onde vai o acumulado.');
    const percentual = C.numero(f.get('percentual'));
    if (String(f.get('percentual') || '').trim() === '') throw new Error('Informe o percentual acumulado em 12 meses.');
    await alterar((db) => {
      const existente = db.indices_acumulados.find((x) => x.indice === indice && x.mes_ref === mesRef);
      if (existente) R.atualizar(db, 'indices_acumulados', existente.id, { percentual }, login(), `${indice} até ${compBr(mesRef)}: ${pct(percentual)}`);
      else R.inserir(db, 'indices_acumulados', { indice, mes_ref: mesRef, percentual }, login(), `${indice} até ${compBr(mesRef)}: ${pct(percentual)}`);
    });
    aviso('Índice salvo.');
    await mostrar();
  },
  /**
   * Reajuste (tela Reajustes): sem mexer, vale o índice cadastrado; com o % mudado, vale o %; com o aluguel cheio ou o
   * bonificado mudado, vale o aluguel cheio (o % é recalculado). Sem índice cadastrado, é preciso digitar um deles.
   */
  async aplicarReajusteManual(form) {
    const f = new FormData(form);
    const origem = form.dataset.origem || '';
    const pctIndice = form.dataset.pctIndice === '' || form.dataset.pctIndice === undefined ? null : Number(form.dataset.pctIndice);
    const temPct = String(f.get('percentual') || '').trim() !== '';
    const pctDigitado = temPct ? C.numero(f.get('percentual')) : null;
    const valor = String(f.get('valor_novo') || '').trim() ? C.centavos(f.get('valor_novo')) : 0;
    if (!temPct && !(valor > 0)) throw new Error('Digite o % da correção ou o novo valor do aluguel.');
    // não mexeu (ou voltou ao % do índice): correção pelo índice cadastrado
    let manual = null;
    if (['valor_novo', 'bonificado'].includes(origem) && valor > 0) manual = valor === C.aplicarCorrecao(Number(form.dataset.atual), pctIndice ?? NaN) ? null : { valor_novo: valor };
    else if (pctIndice === null || (temPct && pctDigitado !== pctIndice)) manual = temPct ? { percentual: pctDigitado } : { valor_novo: valor };
    const bon = String(f.get('bonificado') || '').trim();
    const texto = manual === null ? `${pct(pctIndice)} (índice cadastrado)` : manual.valor_novo ? `o novo aluguel de ${reais(manual.valor_novo)}` : pct(manual.percentual);
    if (!confirm(`Registrar a correção do aluguel de ${compBr(form.dataset.comp)} com ${texto}?${valor > 0 ? ` Aluguel cheio ${reais(valor)}${bon ? `, com bonificação R$ ${bon}` : ''}.` : ''} Os boletos em aberto são recalculados.`)) return;
    await aplicarReajusteNaTela(Number(form.dataset.contrato), form.dataset.comp, manual);
  },
  irImpostos: (form) => ir(`#/impostos?mes=${new FormData(form).get('mes')}`),

  /** Valor da guia calculado pelo contador (vazio apaga). */
  async guiaImposto(form) {
    const texto = String(new FormData(form).get('valor') || '').trim();
    const valor = texto ? C.centavos(texto) : null;
    if (valor !== null && !(valor >= 0)) throw new Error('Valor inválido.');
    const { emitente, imposto, periodo } = form.dataset;
    await alterar((db) => R.salvarGuiaImposto(db, Number(emitente), imposto, periodo, valor, login()));
    aviso(valor === null ? 'Valor do contador apagado.' : 'Valor do contador salvo.');
    await mostrar();
  },

  filtroResultados(form) {
    const q = new URLSearchParams([...new FormData(form)].filter(([, v]) => v));
    ir(`#/resultados?${q}`);
  },
  irMes: (form) => ir(`#/cobrancas?comp=${new FormData(form).get('comp')}`),
  irMesFatura: (form) => ir(`#/faturas?mes=${new FormData(form).get('mes')}`),
  buscaInquilinos(form) {
    const busca = String(new FormData(form).get('busca') || '').trim();
    ir(busca ? `#/inquilinos?busca=${encodeURIComponent(busca)}` : '#/inquilinos');
  },
  filtroHistorico(form) {
    const q = new URLSearchParams([...new FormData(form)].filter(([, v]) => v));
    ir(`#/historico?${q}`);
  },

  async logo(form) {
    const arquivo = new FormData(form).get('arquivo');
    if (!arquivo || !arquivo.size) throw new Error('Escolha o arquivo da logo.');
    const dataUrl = await reduzirImagem(arquivo);
    await alterar((db) => {
      R.registrar(db, login(), 'Alteração', null, null, db.logo ? 'Logo da empresa trocada' : 'Logo da empresa enviada');
      db.logo = dataUrl;
    });
    aviso('Logo salva.');
    await mostrar();
  },

  async estilosAlertas(form) {
    const f = Object.fromEntries(new FormData(form));
    const estilos = {};
    for (let n = 0; f[`tipo_${n}`] !== undefined; n += 1) estilos[f[`tipo_${n}`]] = { cor: f[`cor_${n}`], enfase: f[`enfase_${n}`], prioridade: f[`prioridade_${n}`] };
    await alterar((db) => R.salvarEstilosAlertas(db, estilos, login()));
    aviso('Aparência dos alertas salva.');
    ir('#/');
  },

  async proximaFatura(form) {
    const n = Number(new FormData(form).get('numero'));
    if (!Number.isInteger(n) || n < 1) throw new Error('Número inválido.');
    const ultima = R.ultimaFatura(E.d);
    if (ultima && n <= ultima.numero && !confirm(`Já existe a NF nº ${R.numeroFatura(ultima.numero)}. Usar ${R.numeroFatura(n)} mesmo assim vai repetir números. Continuar?`)) return;
    await alterar((db) => {
      R.registrar(db, login(), 'Alteração', 'faturas', null, 'Próximo número de NF', { proxima_fatura: { de: db.proxima_fatura, para: n } });
      db.proxima_fatura = n;
    });
    aviso('Numeração atualizada.');
    await mostrar();
  },

  async importar(form) {
    const f = new FormData(form);
    const arq = f.get('zip');
    if (!arq || !arq.size) throw new Error('Escolha o arquivo ZIP.');
    if (f.get('confirmo') !== '1') throw new Error('Marque a confirmação: a importação substitui os dados desta pasta.');
    const JSZip = await jsZip();
    const novos = await S.importarZip(JSZip, E.pasta, arq, E.d);
    E.d = novos;
    await alterar((db) => R.registrar(db, login(), 'Importação', 'banco', null, `Dados importados de ${arq.name}`, null, {}, false));
    E.usuario = E.d.usuarios.find((u) => u.login === E.usuario.login && u.ativo) || null;
    renovarUsuario();
    aviso('Dados importados. Uma cópia do banco anterior ficou na pasta backups.');
    ir('#/');
  },

  async modeloExcel(form) {
    const arq = new FormData(form).get('modelo');
    if (!arq || !arq.size) throw new Error('Escolha o arquivo .xlsx.');
    const ExcelJS = await excelJs();
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(await arq.arrayBuffer());
    } catch {
      throw new Error('Não consegui abrir este arquivo como planilha Excel (.xlsx).');
    }
    const dir = await E.pasta.getDirectoryHandle(S.PASTA_MODELOS, { create: true });
    await S.escreverTexto(dir, S.MODELO_FATURA, arq);
    await alterar((db) => R.registrar(db, login(), 'Alteração', 'banco', null, `Modelo Excel da NF enviado (abas: ${wb.worksheets.map((w) => w.name).join(', ')})`));
    aviso('Modelo salvo.');
    await mostrar();
  },
};

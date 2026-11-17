// LGPD e permissões na nuvem (mutirão 3000, 2ª rodada, frente lgpd): rastros da ficha reprovada apagados também no servidor,
// ações só do administrador conferidas no cofre, backups diários cifrados com a chave do backup seguro (com a restauração).
// Dados fictícios (CPF de teste 529.982.247-25).
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import * as B from '../docs/js/backup-seguro.js';
import { Cofre, REGRAS_DO_ADMIN, backupDoDia } from '../nuvem/cofre.mjs';
import { r2Falso } from './r2-falso.mjs';

function sqlFalso() {
  const db = new DatabaseSync(':memory:');
  return {
    db,
    exec(q, ...p) {
      if (!p.length && q.trim().split(';').filter((x) => x.trim()).length > 1) { db.exec(q); return { toArray: () => [] }; }
      const linhas = db.prepare(q).all(...p).map((l) => ({ ...l }));
      return { toArray: () => linhas };
    },
  };
}
const tx = (sql) => (fn) => { sql.db.exec('BEGIN'); try { const r = fn(); sql.db.exec('COMMIT'); return r; } catch (e) { sql.db.exec('ROLLBACK'); throw e; } };
const hora = new Date('2026-11-17T10:00:00-03:00');
const DONO = 'dono@exemplo.com.br'; const OPERADOR = 'operador@exemplo.com.br';
const CPF = '529.982.247-25'; const EMAIL = 'interessado@exemplo.com'; const FONE = '(41) 99999-0000';
const banco = () => ({
  formato: 'imoveis-v1', proxima_fatura: 10,
  usuarios: [{ id: 1, login: DONO, papel: 'admin', ativo: true }, { id: 3, login: OPERADOR, papel: 'operador', ativo: true }],
  fichas: [{ id: 7, inquilino_nome: 'Interessado Teste', inquilino_cpf: CPF, inquilino_email: EMAIL, inquilino_telefone: FONE, situacao: 'Reprovada', decisao_data: '2026-08-01', reserva_valor: 50000 }],
  envios_email: [{ id: 2, ficha_id: 7, para: EMAIL, assunto: 'Ficha recebida' }],
  contratos: [{ id: 5, inquilino_nome: 'Inquilino Teste', doc_contrato_perdido_em: null, doc_contrato_perdido_pendente: null }],
  aditivos: [{ id: 9, contrato_id: 5, data: '2026-01-10', perdido_em: null, perdido_pendente: null }],
  pagamentos_banco: [{ id: 4, situacao: 'rascunho', valor: 10000, aprovado_por: null, aprovado_em: null }],
  cobrancas: [{ id: 6, contrato_id: 5, competencia: '2026-10', banco: { situacao: 'emitido', negativacao: null } }],
  historico: [
    { tabela: 'fichas', registro_id: 7, acao: 'Inclusão', descricao: `Ficha de Interessado Teste (${CPF})`, detalhes: { inquilino_nome: 'Interessado Teste', inquilino_cpf: CPF, inquilino_telefone: FONE } },
    { tabela: 'envios_email', registro_id: 2, acao: 'Inclusão', descricao: `E-mail para ${EMAIL}`, detalhes: { para: EMAIL, ficha_id: 7 } },
  ],
});
const novo = () => { const sql = sqlFalso(); const c = new Cofre(sql, tx(sql), () => hora); c.importar(banco(), DONO); return c; };
let n = 0;
const lote = (ops) => ({ id: `lgpd-lote-${String(n += 1).padStart(5, '0')}`, ops });
/** Tudo o que o cofre guarda, em texto (registros, histórico, fila, excluídos, conflitos). */
const tudoEmTexto = (c) => ['registros', 'historico', 'log', 'excluidos', 'conflitos'].map((t) => JSON.stringify(c.q(`SELECT * FROM ${t}`))).join('\n');

test('ficha reprovada com os dados apagados nos aparelhos: a faxina do servidor tira o CPF, o e-mail e o telefone do que guarda', () => {
  const c = novo();
  // o aparelho muda a ficha (como o cliente em mudança de endereço) e depois apaga os dados pessoais (R.apagarDadosPessoaisDaFicha)
  c.aplicar(lote([{ op: 'alterar', tabela: 'fichas', id: 7, campos: { inquilino_telefone: { antes: FONE, depois: '(41) 98888-1111' } } },
    { op: 'historico', entrada: { tabela: 'fichas', registro_id: 7, acao: 'Alteração', descricao: 'Ficha de Interessado Teste', detalhes: { inquilino_telefone: { de: FONE, para: '(41) 98888-1111' } } } }]), OPERADOR);
  c.aplicar(lote([
    { op: 'alterar', tabela: 'fichas', id: 7, campos: { inquilino_cpf: { antes: CPF, depois: null }, inquilino_email: { antes: EMAIL, depois: null }, inquilino_telefone: { antes: '(41) 98888-1111', depois: null }, dados_apagados_em: { antes: undefined, depois: '2026-11-17' } } },
    { op: 'alterar', tabela: 'envios_email', id: 2, campos: { para: { antes: EMAIL, depois: null } } },
  ]), OPERADOR);
  assert.ok(tudoEmTexto(c).includes(CPF), 'antes da faxina, o histórico do servidor ainda tem o CPF');
  const seq = c.ultimoSeq();
  c.limpar();
  const texto = tudoEmTexto(c);
  for (const x of [CPF, EMAIL, FONE, '(41) 98888-1111']) assert.ok(!texto.includes(x), `${x} ainda está guardado no servidor`);
  const ficha = c.tudo().fichas.find((f) => f.id === 7);
  assert.equal(ficha.inquilino_nome, 'Interessado Teste', 'o nome fica');
  assert.equal(ficha.reserva_valor, 50000, 'a reserva fica');
  assert.equal(ficha.historico_limpo_em, '2026-11-17');
  const h = c.tudo().historico.find((x) => x.tabela === 'fichas' && x.acao === 'Inclusão');
  assert.equal(h.detalhes.inquilino_nome, 'Interessado Teste');
  assert.equal(h.descricao, 'Ficha de Interessado Teste ((apagado))');
  // a marca vai para os aparelhos pela fila; rodar de novo não refaz
  assert.equal(c.mudancas(seq).refazer, true, 'os aparelhos baixam tudo de novo (a cópia velha do histórico deles sai)');
  assert.deepEqual(c.esquecerFichasApagadas(), []);
});

test('ficha em análise ou sem os dados apagados não é tocada', () => {
  const c = novo();
  c.limpar();
  assert.ok(tudoEmTexto(c).includes(CPF));
  assert.equal(c.tudo().fichas[0].historico_limpo_em, undefined);
});

test('só o administrador confirma perdas, aceita documento parcial, aprova pagamento e negativa (a nuvem confere)', () => {
  const c = novo();
  const recusa = /Só o administrador pode/;
  // operador registra a perda aguardando o administrador: entra; confirmar (tirar o "aguardando") é recusado
  assert.equal(c.aplicar(lote([{ op: 'alterar', tabela: 'contratos', id: 5, campos: { doc_contrato_perdido_em: { antes: null, depois: '2026-11-17' }, doc_contrato_perdido_pendente: { antes: null, depois: 'operador' } } }]), OPERADOR).ok, true);
  assert.throws(() => c.aplicar(lote([{ op: 'alterar', tabela: 'contratos', id: 5, campos: { doc_contrato_perdido_pendente: { antes: 'operador', depois: null } } }]), OPERADOR), recusa);
  // desfazer a perda (os dois vazios) o operador pode
  assert.equal(c.aplicar(lote([{ op: 'alterar', tabela: 'contratos', id: 5, campos: { doc_contrato_perdido_em: { antes: '2026-11-17', depois: null }, doc_contrato_perdido_pendente: { antes: 'operador', depois: null } } }]), OPERADOR).ok, true);
  // perda já valendo direto: recusada
  assert.throws(() => c.aplicar(lote([{ op: 'alterar', tabela: 'contratos', id: 5, campos: { doc_contrato_perdido_em: { antes: null, depois: '2026-11-17' } } }]), OPERADOR), recusa);
  // documento com assinatura faltante: pendente sim, conferido não
  assert.equal(c.aplicar(lote([{ op: 'alterar', tabela: 'contratos', id: 5, campos: { doc_contrato_parcial: { antes: undefined, depois: { data: '2026-11-17', arquivo: 'x.pdf', falta: ['Fiador'], pendente: true } } } }]), OPERADOR).ok, true);
  assert.throws(() => c.aplicar(lote([{ op: 'alterar', tabela: 'contratos', id: 5, campos: { doc_contrato_parcial: { antes: { data: '2026-11-17', arquivo: 'x.pdf', falta: ['Fiador'], pendente: true }, depois: { data: '2026-11-17', arquivo: 'x.pdf', falta: ['Fiador'], pendente: false } } } }]), OPERADOR), recusa);
  // termo aditivo perdido sem "aguardando": recusado (registro novo também)
  assert.throws(() => c.aplicar(lote([{ op: 'alterar', tabela: 'aditivos', id: 9, campos: { perdido_em: { antes: null, depois: '2026-11-17' } } }]), OPERADOR), recusa);
  assert.throws(() => c.aplicar(lote([{ op: 'inserir', tabela: 'aditivos', id: 10, dados: { id: 10, contrato_id: 5, perdido_em: '2026-11-17', perdido_pendente: null } }]), OPERADOR), recusa);
  assert.equal(c.aplicar(lote([{ op: 'inserir', tabela: 'aditivos', id: 11, dados: { id: 11, contrato_id: 5, perdido_em: '2026-11-17', perdido_pendente: 'operador' } }]), OPERADOR).ok, true);
  // aprovar pagamento
  assert.throws(() => c.aplicar(lote([{ op: 'alterar', tabela: 'pagamentos_banco', id: 4, campos: { situacao: { antes: 'rascunho', depois: 'aguardando_aprovacao' } } }]), OPERADOR), recusa);
  assert.throws(() => c.aplicar(lote([{ op: 'alterar', tabela: 'pagamentos_banco', id: 4, campos: { aprovado_por: { antes: null, depois: 'operador' } } }]), OPERADOR), recusa);
  assert.equal(c.aplicar(lote([{ op: 'alterar', tabela: 'pagamentos_banco', id: 4, campos: { situacao: { antes: 'rascunho', depois: 'cancelado' } } }]), OPERADOR).ok, true);
  // negativação
  const comNeg = { situacao: 'emitido', negativacao: { situacao: 'agendada', agendada_em: '2026-11-17T10:00:00Z', cancelada_em: null } };
  assert.throws(() => c.aplicar(lote([{ op: 'alterar', tabela: 'cobrancas', id: 6, campos: { banco: { antes: { situacao: 'emitido', negativacao: null }, depois: comNeg } } }]), OPERADOR), recusa);
  // o administrador faz tudo isso
  assert.equal(c.aplicar(lote([{ op: 'alterar', tabela: 'cobrancas', id: 6, campos: { banco: { antes: { situacao: 'emitido', negativacao: null }, depois: comNeg } } }]), DONO).ok, true);
  assert.equal(c.aplicar(lote([{ op: 'alterar', tabela: 'aditivos', id: 11, campos: { perdido_pendente: { antes: 'operador', depois: null } } }]), DONO).ok, true);
  // a consulta do banco feita pelo operador (situação vinda do C6) não esbarra na regra da negativação
  assert.equal(c.aplicar(lote([{ op: 'alterar', tabela: 'cobrancas', id: 6, campos: { banco: { antes: comNeg, depois: { ...comNeg, negativacao: { ...comNeg.negativacao, situacao: 'negativado' } } } } }]), OPERADOR).ok, true);
  assert.ok(REGRAS_DO_ADMIN.length >= 5);
});

test('config_banco, regras do sistema e usuários continuam só do administrador', () => {
  const c = novo();
  assert.throws(() => c.aplicar(lote([{ op: 'raiz', campo: 'config_banco', antes: undefined, depois: { ativo: true } }]), OPERADOR), /Só o administrador/);
  assert.throws(() => c.aplicar(lote([{ op: 'inserir', tabela: 'config_regras', id: 1, dados: { id: 1, chave: 'multa', valor: 0 } }]), OPERADOR), /Só o administrador/);
  assert.throws(() => c.aplicar(lote([{ op: 'inserir', tabela: 'versoes_regras', id: 1, dados: { id: 1 } }]), OPERADOR), /Só o administrador/);
  assert.throws(() => c.aplicar(lote([{ op: 'alterar', tabela: 'usuarios', id: 3, campos: { papel: { antes: 'operador', depois: 'admin' } } }]), OPERADOR), /Só o administrador/);
  assert.throws(() => c.aplicar(lote([{ op: 'historico', entrada: { tabela: 'config_regras', registro_id: 1, descricao: 'x' } }]), OPERADOR), /Só o administrador/);
});

test('backup diário da nuvem cifrado com a chave do backup seguro: só abre com a senha, e a restauração devolve o banco igual', async () => {
  const c = novo(); const r2 = r2Falso();
  // sem chave: como antes (JSON aberto)
  assert.equal(await backupDoDia(c, r2, new Date('2026-11-16T10:00:00-03:00')), true);
  assert.ok(r2.m.has('backups/imoveis-dados-2026-11-16.json'));
  const chave = await B.criarChave('frase do backup de teste');
  await assert.rejects(() => c.ligarChaveDoBackup({ chave }, OPERADOR), /Seu usuário não pode/);
  await assert.rejects(() => c.ligarChaveDoBackup({ chave: { ...chave, publica: 'AAAA' } }, DONO), /danificada/);
  await assert.rejects(() => c.ligarChaveDoBackup({ chave: { formato: 'outro' } }, DONO), /não é a chave/);
  const r = await c.ligarChaveDoBackup({ chave }, DONO);
  assert.equal(r.ligada, true); assert.match(r.resumo, /^[0-9a-f]{12}$/);
  assert.equal(await backupDoDia(c, r2, new Date('2026-11-17T10:00:00-03:00')), true);
  const nome = 'backups/imoveis-dados-2026-11-17.bkp';
  assert.ok(r2.m.has(nome) && !r2.m.has('backups/imoveis-dados-2026-11-17.json'));
  const bytes = new Uint8Array(await (await r2.get(nome)).arrayBuffer());
  assert.ok(!new TextDecoder().decode(bytes).includes(CPF), 'o CPF não aparece no arquivo cifrado');
  await assert.rejects(() => B.decifrar(bytes, 'senha errada de teste'), /Senha do backup incorreta/);
  const aberto = await B.decifrar(bytes, 'frase do backup de teste');
  assert.equal(aberto.info.tipo, 'diario');
  const restaurado = JSON.parse(new TextDecoder().decode(aberto.dados));
  const agora = c.tudo();
  delete restaurado._nuvem; delete agora._nuvem;
  assert.deepEqual(restaurado, agora);
  // "Voltar para este dia" com o backup decifrado: entra no cofre e fica igual
  const c2 = novo();
  c2.importar(restaurado, DONO, { substituir: true, manterUsuarios: true });
  assert.equal(c2.tudo().fichas[0].inquilino_cpf, CPF);
  // a cópia "antes da substituição" também sai cifrada; a faxina conta .json e .bkp juntos
  assert.equal(await backupDoDia(c, r2, new Date('2026-11-17T11:00:00-03:00'), 'antes-da-substituicao'), true);
  assert.ok(r2.m.has('backups/imoveis-dados-2026-11-17-antes-da-substituicao.bkp'));
  // desligar volta ao JSON
  assert.deepEqual(await c.ligarChaveDoBackup({ chave: null }, DONO), { ligada: false });
  assert.equal(c.chaveDoBackup(), null);
});

test('"Apagar tudo desta pessoa" do administrador: o cofre apaga o histórico guardado desses registros e os aparelhos baixam tudo de novo', async () => {
  const { ACAO_APAGAR } = await import('../docs/js/pessoa.js');
  const { ACAO_APAGAR_PESSOA } = await import('../nuvem/cofre.mjs');
  assert.equal(ACAO_APAGAR, ACAO_APAGAR_PESSOA);
  const c = novo();
  c.aplicar(lote([{ op: 'historico', entrada: { tabela: 'contratos', registro_id: 5, contrato_id: 5, acao: 'Alteração', descricao: 'Inquilino Teste: telefone', detalhes: { telefone: { de: 'a', para: 'b' } } } },
    { op: 'historico', entrada: { tabela: 'cobrancas', registro_id: 6, contrato_id: 5, acao: 'Alteração', descricao: 'Boleto de Inquilino Teste' } }]), OPERADOR);
  const seq = c.ultimoSeq();
  const det = { registros: [{ tabela: 'contratos', id: 5 }, { tabela: 'cobrancas', id: 6 }], limpos: [], contratos: [5] };
  const ops = [{ op: 'excluir', tabela: 'cobrancas', id: 6 }, { op: 'excluir', tabela: 'contratos', id: 5 },
    { op: 'historico', entrada: { tabela: null, registro_id: null, acao: ACAO_APAGAR, descricao: 'Dados de uma pessoa apagados', detalhes: det } }];
  // só o administrador (o operador nem exclui o contrato)
  assert.throws(() => c.aplicar(lote(ops), OPERADOR), /Só o administrador exclui/);
  c.aplicar(lote(ops), DONO);
  assert.ok(!tudoEmTexto(c).includes('Inquilino Teste'), 'o nome saiu do histórico, da fila e dos excluídos');
  assert.equal(c.q("SELECT COUNT(*) AS n FROM log WHERE tipo = 'exclusao'")[0].n, 2, 'o aviso de exclusão fica para os aparelhos atrasados');
  assert.equal(c.mudancas(seq).refazer, true, 'os aparelhos baixam tudo de novo');
  assert.ok(c.tudo().historico.some((h) => h.acao === ACAO_APAGAR));
});

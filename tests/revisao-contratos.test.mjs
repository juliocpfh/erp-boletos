// Revisão de 09/11/2026 (contratos): renovação no cadastro, termo da troca com o fiador, vistoria de saída de quem herdou,
// extenso, numeração dos termos aditivos, exclusão do contrato, termo da troca assinado e datas por extenso.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as K from '../docs/js/contratos.js';
import * as R from '../docs/js/regras.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const texto = (blocos) => blocos.map((b) => (b.runs ? b.runs.map((r) => r.t).join('') : b.linhas ? '[tabela]' : `[${(b.pessoas || []).map((p) => p.papel).join(', ')}]`)).join('\n');

/** Formulário "Editar contrato" (valores → ajustar) num processo à parte (app.js não roda no Node). */
function editarNoCadastro(d, id, mudancas = {}) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'cadastro-'));
  const arquivo = path.join(pasta, 'banco.json');
  fs.writeFileSync(arquivo, JSON.stringify(d));
  try {
    execFileSync(process.execPath, [path.join(AQUI, 'cadastro-contrato-node.mjs'), arquivo, String(id), JSON.stringify(mudancas)], { stdio: 'ignore', timeout: 60000 });
    return JSON.parse(fs.readFileSync(`${arquivo}.saida.json`, 'utf8'));
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}

function casa() {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK ADMINISTRADORA DE BENS LTDA', cnpj: '11.222.333/0001-81', ativo: true, endereco_sede: 'Rua A, 1',
    representante_nome: 'Maria', representante_genero: 'Feminino', representante_cargo: 'sócia' }, 'j');
  const i = R.inserir(d, 'imoveis', { nome: 'Casa 3', endereco: 'Rua X, 10', cidade: 'Curitiba' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: i.id, emitente_id: ank.id, percentual: 100 }, 'j');
  return { d, i };
}

// --------------------------------------------------------------------------
// 1. Renovação: o fim do contrato não volta ao início + prazo ao editar o cadastro
// --------------------------------------------------------------------------
function renovado() {
  const { d, i } = casa();
  const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Pedro Souza', inquilino_cpf: '529.982.247-25', telefone: '41 3333-0000', data_entrada: '2024-03-05',
    vigencia_inicio: '2024-03-05', prazo_tipo: 'Determinado', prazo_meses: 30, vigencia_fim: '2026-09-05', aluguel_inicial: 300000, dia_vencimento: 10,
    garantia_tipo: 'Sem garantia', bonificacao: false }, 'j');
  R.registrarRenovacao(d, c.id, { data: '2026-09-05', tipo: 'Renovado com nova data de término', nova_vigencia_fim: '2028-09-05' }, 'j');
  return { d, i, c };
}

test('renovação: leva o fim e o prazo juntos (05/03/2024 a 05/09/2028 = 54 meses), um fim só para o contrato', () => {
  const { d, c } = renovado();
  assert.equal(c.vigencia_fim, '2028-09-05');
  assert.equal(c.prazo_meses, 54, 'o prazo acompanha a renovação (não ficam duas verdades)');
  assert.equal(R.fimDoContrato(d, c), '2028-09-05');
  assert.equal(R.prazoDoContrato(d, c), 54);
  // sem renovação: início + prazo
  const { d: d2, i } = casa();
  const s = R.inserir(d2, 'contratos', { imovel_id: i.id, inquilino_nome: 'Ana', data_entrada: '2026-09-05', vigencia_inicio: '2026-09-01', prazo_tipo: 'Determinado', prazo_meses: 30 }, 'j');
  assert.equal(R.fimDoContrato(d2, s), '2029-03-05', 'conta da data de vigência inicial');
  // "Passou a prazo indeterminado" depois da renovação: a nova data deixa de valer
  R.registrarRenovacao(d, c.id, { data: '2028-09-05', tipo: 'Passou a prazo indeterminado' }, 'j');
  assert.equal(c.prazo_tipo, 'Indeterminado');
  assert.equal(R.fimDoContrato(d, { ...c, prazo_tipo: 'Determinado', prazo_meses: 60 }), '2029-03-05');
});

test('renovação: editar só o telefone no cadastro mantém o fim da renovação (05/09/2028)', () => {
  const { d, c } = renovado();
  const r = editarNoCadastro(d, c.id, { telefone: '41 99999-0000' });
  assert.deepEqual(r.erros, {});
  assert.equal(r.dados.vigencia_fim, '2028-09-05', 'não volta a 05/09/2026 (início + 30 meses)');
  assert.equal(r.dados.prazo_meses, 54);
  // renovação gravada antes desta correção (prazo ainda 30): o formulário já mostra e grava 54 meses
  c.prazo_meses = 30;
  const antigo = editarNoCadastro(d, c.id, { telefone: '41 99999-0000' });
  assert.deepEqual(antigo.erros, {});
  assert.equal(antigo.dados.vigencia_fim, '2028-09-05');
  assert.equal(antigo.dados.prazo_meses, 54);
  // mudar o prazo de um contrato renovado: avisa que o fim muda pela renovação
  const mudou = editarNoCadastro(d, c.id, { prazo_meses: 36 });
  assert.match(mudou.erros.prazo_meses || '', /renovado até 05\/09\/2028/);
  // contrato sem renovação: o prazo continua mandando no fim
  const { d: d2, i } = casa();
  const s = R.inserir(d2, 'contratos', { imovel_id: i.id, inquilino_nome: 'Ana', inquilino_cpf: '529.982.247-25', data_entrada: '2026-09-05', vigencia_inicio: '2026-09-05',
    prazo_tipo: 'Determinado', prazo_meses: 30, vigencia_fim: '2029-03-05', aluguel_inicial: 200000, dia_vencimento: 10, garantia_tipo: 'Sem garantia', bonificacao: false }, 'j');
  const outro = editarNoCadastro(d2, s.id, { prazo_meses: 36 });
  assert.deepEqual(outro.erros, {});
  assert.equal(outro.dados.vigencia_fim, '2029-09-05');
});

test('renovação: troca de titular continua com o fim do contrato assumido; renovado, vale a renovação', () => {
  const { d, i, c } = renovado();
  const n = R.inserir(d, 'contratos', { imovel_id: i.id, contrato_anterior_id: c.id, inquilino_nome: 'Lúcia Prado', inquilino_cpf: '529.982.247-25', data_entrada: '2027-04-01',
    vigencia_inicio: '2027-04-01', prazo_tipo: 'Determinado', prazo_meses: 30, vigencia_fim: '2028-09-05', aluguel_inicial: 300000, dia_vencimento: 10, garantia_tipo: 'Sem garantia', bonificacao: false }, 'j');
  assert.equal(R.fimDoContrato(d, n), '2028-09-05', 'o prazo não recomeça na troca');
  const r = editarNoCadastro(d, n.id, { telefone: '41 98888-0000' });
  assert.deepEqual(r.erros, {});
  assert.equal(r.dados.vigencia_fim, '2028-09-05');
  R.inserir(d, 'aditivos', { contrato_id: n.id, imovel_id: i.id, tipo: 'Troca de titular', data: '2027-04-01', assunto: 'Troca', arquivo: 'termo.pdf' }, 'j');
  R.registrarRenovacao(d, n.id, { data: '2028-09-05', tipo: 'Renovado com nova data de término', nova_vigencia_fim: '2030-09-05' }, 'j');
  assert.equal(R.fimDoContrato(d, n), '2030-09-05');
  assert.equal(editarNoCadastro(d, n.id, { telefone: '41 97777-0000' }).dados.vigencia_fim, '2030-09-05');
});

test('renovação: contrato que perdeu o fim da renovação ao ser editado volta ao fim renovado na rotina de abertura', () => {
  const { d, c } = renovado();
  // o que a edição antiga gravava: início + prazo (05/09/2026), com o prazo de antes da renovação
  Object.assign(c, { vigencia_fim: '2026-09-05', prazo_meses: 30 });
  assert.ok(R.rotinaDeAbertura(d, 'julio', { soConferir: true }) >= 1);
  R.rotinaDeAbertura(d, 'julio');
  assert.equal(c.vigencia_fim, '2028-09-05');
  assert.equal(c.prazo_meses, 54);
  assert.ok(d.historico.some((h) => /renovação/.test(h.descricao) && /05\/09\/2028/.test(h.descricao)), 'passa pelo histórico');
  assert.equal(R.rotinaDeAbertura(d, 'julio', { soConferir: true }), 0, 'uma vez só');
});

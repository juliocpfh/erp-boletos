// Alertas do painel: seguro, reserva e fim de vigência (o do reajuste fica em regras.js).
import { compBr, competenciaDe, dataBr, diasEntre, reais, somarAnos, somarDias, somarMeses } from './calculos.js';

export const ANTECEDENCIA_SEGURO = 60;
export const ANTECEDENCIA_VIGENCIA = 60;

/** [último aniversário já ocorrido (ou null no 1º ano), próximo aniversário]. */
export function aniversarios(inicio, hoje) {
  let anos = 1;
  let ultimo = null;
  while (somarAnos(inicio, anos) <= hoje) {
    ultimo = somarAnos(inicio, anos);
    anos += 1;
  }
  return [ultimo, somarAnos(inicio, anos)];
}

export function alertaSeguro(inicio, hoje, seguros) {
  const fins = seguros.map((s) => s.vigencia_fim).filter(Boolean).sort();
  if (!fins.length) {
    return { nivel: 'aviso', tipo: 'Seguro obrigatório', texto: 'Nenhum seguro cadastrado para este imóvel.' };
  }
  const fim = fins[fins.length - 1];
  const faltam = diasEntre(hoje, fim);
  if (faltam < 0) {
    return { nivel: 'perigo', tipo: 'Seguro obrigatório', texto: `Seguro vencido em ${dataBr(fim)}. Renove a apólice.` };
  }
  if (faltam <= ANTECEDENCIA_SEGURO) {
    return { nivel: 'aviso', tipo: 'Seguro obrigatório',
      texto: `Seguro vence em ${dataBr(fim)} (faltam ${faltam} dias). Providencie a renovação.` };
  }
  if (inicio) {
    const [, proximo] = aniversarios(inicio, hoje);
    if (diasEntre(hoje, proximo) <= ANTECEDENCIA_SEGURO && fim <= somarDias(proximo, 15)) {
      return { nivel: 'aviso', tipo: 'Seguro obrigatório',
        texto: `Aniversário do contrato em ${dataBr(proximo)}: confira a renovação do seguro.` };
    }
  }
  return null;
}

export function alertaReserva(reservaValor, saldo, competenciaAlvo, hoje) {
  if (!(reservaValor > 0) || !(saldo > 0) || !competenciaAlvo) return null;
  const proxima = somarMeses(competenciaDe(hoje), 1);
  // reserva marcada para um mês que já passou: não fica mais nos alertas
  if (competenciaAlvo < somarMeses(competenciaDe(hoje), -1)) return null;
  if (competenciaAlvo <= proxima) {
    return { nivel: 'info', tipo: 'Reserva do imóvel',
      texto: `Reserva de ${reais(saldo)} será usada para abater o boleto de ${compBr(competenciaAlvo)}.` };
  }
  return null;
}

export function alertaVigencia(vigenciaFim, hoje) {
  if (!vigenciaFim) return null;
  const faltam = diasEntre(hoje, vigenciaFim);
  if (faltam < 0) {
    return { nivel: 'aviso', tipo: 'Vigência do contrato',
      texto: `Vigência terminou em ${dataBr(vigenciaFim)}. Registre a renovação (nova data ou prazo indeterminado, com o novo valor negociado) ou a saída.` };
  }
  if (faltam <= ANTECEDENCIA_VIGENCIA) {
    return { nivel: 'aviso', tipo: 'Vigência do contrato',
      texto: `Vigência termina em ${dataBr(vigenciaFim)} (faltam ${faltam} dias). Hora de negociar a renovação e o novo valor.` };
  }
  return null;
}

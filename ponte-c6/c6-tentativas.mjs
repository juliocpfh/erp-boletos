// Nova tentativa nas CONSULTAS ao C6 (só GET): até 2 vezes, com pausas de 1 s e 3 s, quando o banco responde 429, 502, 503 ou 504
// ou não responde a tempo. Emissão, alteração, baixa e pagamento (POST, PUT, PATCH, DELETE) NUNCA são repetidos aqui: passam direto.
//
// comNovasTentativas(metodo, chamar, { pausas, esperar }) → o que `chamar()` devolver ({ status, … }) ou o erro dele.
//   - `chamar` pode devolver { status } (cliente da fase 2) ou lançar (tempo esgotado, conexão reaproveitada que caiu);
//   - esgotadas as tentativas, a resposta ruim volta como está e o erro sai marcado (`tentativasEsgotadas`), para uma
//     camada de fora não repetir tudo de novo.

export const PAUSAS_MS = [1000, 3000];
export const STATUS_PASSAGEIROS = [429, 502, 503, 504];

/** Erro que vale tentar de novo: o banco não respondeu a tempo, ou a conexão reaproveitada caiu antes da resposta. */
export const erroPassageiro = (e) => !!e && !e.tentativasEsgotadas
  && (e.code === 'TEMPO_ESGOTADO' || e.code === 'ETIMEDOUT' || (e.code === 'ECONNRESET' && e.socketReusado === true));

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

export async function comNovasTentativas(metodo, chamar, { pausas = PAUSAS_MS, esperar = dormir } = {}) {
  if (String(metodo).toUpperCase() !== 'GET') return chamar(); // só consulta se repete
  for (let i = 0; ; i += 1) {
    const ultima = i >= pausas.length;
    try {
      const r = await chamar();
      if (ultima || !STATUS_PASSAGEIROS.includes(r && r.status)) return r;
    } catch (e) {
      if (!erroPassageiro(e)) throw e;
      if (ultima) {
        e.tentativasEsgotadas = true;
        if (!e.status) e.status = 504; // para quem traduz o erro: foi o banco que não respondeu
        throw e;
      }
    }
    await esperar(pausas[i]);
  }
}

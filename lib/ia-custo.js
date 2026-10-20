// Custo em R$ do uso da IA (Claude Haiku 4.5) a partir dos tokens gravados em
// conversas_ia — extraído de admin-monitoramento.js (US68) pra ser reusado
// também no detalhe do tenant (aba Consumo), sem duplicar os preços/cotação.
const IA_PRECO_USD_ENTRADA_POR_MILHAO = 1.0;
const IA_PRECO_USD_SAIDA_POR_MILHAO = 5.0;
// Cotação fixa aproximada (não é uma cotação ao vivo) — ajustar aqui de
// tempos em tempos se o real variar muito contra o dólar.
const IA_USD_PARA_BRL = 5.3;

function calcularCustoReaisIA(tokensEntrada, tokensSaida) {
  const usd = (tokensEntrada / 1e6) * IA_PRECO_USD_ENTRADA_POR_MILHAO
    + (tokensSaida / 1e6) * IA_PRECO_USD_SAIDA_POR_MILHAO;
  return Number((usd * IA_USD_PARA_BRL).toFixed(2));
}

module.exports = { calcularCustoReaisIA };

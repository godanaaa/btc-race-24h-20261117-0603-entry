// A long-only BTC trader that follows positive momentum or buys a stabilizing pullback,
// then protects each entry with a fixed profit target and loss limit.
import { runBars } from './vendor/makefun-bars.ts';

const closes = [];
let filledOrders = 0;
let cooldownUntil = -1;
let fallbackSent = false;

await runBars({
  onBatch(state, batch) {
    for (const fill of batch.fills) {
      if (fill.status === 'filled') {
        filledOrders += 1;
        if (fill.side === 'sell') cooldownUntil = batch.seq + 24;
      }
    }

    const bar = batch.bars.find((item) => item.symbol === 'CBBTC');
    if (bar === undefined) return [];
    const close = Number(bar.c);
    closes.push(close);

    const position = state.positions.get('CBBTC');
    if (position !== undefined) {
      const value = state.value('CBBTC', position.qty);
      if (value * 100n >= position.cost * 102n || value * 1000n <= position.cost * 994n) {
        return [{ side: 'sell', symbol: 'CBBTC', qty: position.qty, max_slippage_bps: 100 }];
      }
      return [];
    }

    if (state.cash <= 0n) return [];
    if (batch.seq >= 1300 && filledOrders === 0 && !fallbackSent) {
      fallbackSent = true;
      return [{ side: 'buy', symbol: 'CBBTC', notional_quote_units: state.cash, max_slippage_bps: 100 }];
    }
    if (batch.seq < cooldownUntil || closes.length < 20) return [];

    const n = closes.length;
    let mean20 = 0;
    for (let i = n - 20; i < n; i += 1) mean20 += closes[i];
    mean20 /= 20;
    const trendEntry = n >= 25 && close > closes[n - 25];
    const dipEntry = n >= 6 && close <= mean20 * 0.995 && close / closes[n - 6] - 1 >= -0.001;

    if (trendEntry || dipEntry) {
      return [{ side: 'buy', symbol: 'CBBTC', notional_quote_units: state.cash, max_slippage_bps: 100 }];
    }
    return [];
  },
});

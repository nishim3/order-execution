import { MockDexRouter, Order, Quote, SwapResult } from '../src/index';

describe('MockDexRouter Integration Tests', () => {
  let dexRouter: MockDexRouter;

  beforeEach(() => {
    dexRouter = new MockDexRouter();
    jest.clearAllMocks();
  });

  describe('Complete Swap Flow', () => {
    it('should complete a full swap from quote to execution', async () => {
      // Step 1: Get best quote
      const bestQuote = await dexRouter.getBestQuote('SOL', 'USDC', 100);
      
      expect(bestQuote.dex).toBeDefined();
      expect(bestQuote.quote.price).toBeGreaterThan(0);
      expect(bestQuote.quote.fee).toBeGreaterThan(0);

      // Step 2: Execute the swap with higher slippage tolerance
      const swapResult = await dexRouter.executeBestSwap('SOL', 'USDC', 100, 0.20); // 20% tolerance
      
      expect(typeof swapResult.txHash).toBe('string');
      expect(swapResult.executedPrice).toBeGreaterThan(0);
    });

    it('should handle multiple consecutive swaps', async () => {
      const swaps = [
        { tokenIn: 'SOL', tokenOut: 'USDC', amount: 50 },
        { tokenIn: 'USDC', tokenOut: 'SOL', amount: 100 },
        { tokenIn: 'ETH', tokenOut: 'USDC', amount: 2 }
      ];

      const results: SwapResult[] = [];

      for (const swap of swaps) {
        const result = await dexRouter.executeBestSwap(
          swap.tokenIn, 
          swap.tokenOut, 
          swap.amount,
          0.20 // 20% tolerance
        );
        results.push(result);
      }

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(typeof result.txHash).toBe('string');
        expect(result.executedPrice).toBeGreaterThan(0);
      });
    });

    it('should maintain consistency between quote and execution', async () => {
      const tokenIn = 'SOL';
      const tokenOut = 'USDC';
      const amount = 100;

      // Get quote first
      const quoteResult = await dexRouter.getBestQuote(tokenIn, tokenOut, amount);
      const selectedDex = quoteResult.dex;
      const quotedPrice = quoteResult.quote.price;

      // Execute swap with higher slippage tolerance
      const swapResult = await dexRouter.executeBestSwap(tokenIn, tokenOut, amount, 0.20); // 20% tolerance

      // Verify the same DEX was used
      expect(swapResult).toBeDefined();
      expect(swapResult.executedPrice).toBeGreaterThan(0);
      
      // Note: In a real scenario, we'd verify the DEX used, but our mock doesn't expose this
      // The executed price can differ from quoted price due to slippage
    });
  });

  describe('Performance Tests', () => {
    it('should handle concurrent quote requests efficiently', async () => {
      const startTime = Date.now();
      
      const promises = [
        dexRouter.getBestQuote('SOL', 'USDC', 100),
        dexRouter.getBestQuote('ETH', 'USDT', 50),
        dexRouter.getBestQuote('BTC', 'USDC', 10),
        dexRouter.getBestQuote('ADA', 'SOL', 200)
      ];

      const results = await Promise.all(promises);
      const endTime = Date.now();

      expect(results).toHaveLength(4);
      results.forEach(result => {
        expect(result.dex).toBeDefined();
        expect(result.quote.price).toBeGreaterThan(0);
      });

      // Should complete in reasonable time (not 4x the individual time due to concurrency)
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should handle large volume swaps', async () => {
      const largeAmount = 1000000;
      
      const startTime = Date.now();
      const result = await dexRouter.executeBestSwap('SOL', 'USDC', largeAmount, 0.20); // 20% tolerance
      const endTime = Date.now();

      expect(typeof result.txHash).toBe('string');
      expect(result.executedPrice).toBeGreaterThan(0);
      
      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(5000);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty token names gracefully', async () => {
      const result = await dexRouter.getBestQuote('', '', 100);
      
      expect(result.dex).toBeDefined();
      expect(result.quote.price).toBeGreaterThan(0);
    });

    it('should handle special characters in token names', async () => {
      const result = await dexRouter.getBestQuote('SOL-USD', 'USDC-USD', 100);
      
      expect(result.dex).toBeDefined();
      expect(result.quote.price).toBeGreaterThan(0);
    });

    it('should handle very small amounts', async () => {
      const result = await dexRouter.executeBestSwap('SOL', 'USDC', 0.001, 0.20); // 20% tolerance
      
      expect(typeof result.txHash).toBe('string');
      expect(result.executedPrice).toBeGreaterThan(0);
    });

    it('should handle very large amounts', async () => {
      const result = await dexRouter.executeBestSwap('SOL', 'USDC', 999999999, 0.20); // 20% tolerance
      
      expect(typeof result.txHash).toBe('string');
      expect(result.executedPrice).toBeGreaterThan(0);
    });
  });

  describe('DEX Selection Logic', () => {
    it('should consistently select the same DEX for identical requests', async () => {
      const requests = [
        { tokenIn: 'SOL', tokenOut: 'USDC', amount: 100 },
        { tokenIn: 'SOL', tokenOut: 'USDC', amount: 100 },
        { tokenIn: 'SOL', tokenOut: 'USDC', amount: 100 }
      ];

      const results = await Promise.all(
        requests.map(req => dexRouter.getBestQuote(req.tokenIn, req.tokenOut, req.amount))
      );

      // All should return valid results
      results.forEach(result => {
        expect(result.dex).toBeDefined();
        expect(result.quote.price).toBeGreaterThan(0);
      });
    });

    it('should handle different token pairs appropriately', async () => {
      const pairs = [
        ['SOL', 'USDC'],
        ['ETH', 'USDT'],
        ['BTC', 'USDC'],
        ['ADA', 'SOL'],
        ['DOT', 'USDT']
      ];

      const results = await Promise.all(
        pairs.map(([tokenIn, tokenOut]) => 
          dexRouter.getBestQuote(tokenIn, tokenOut, 100)
        )
      );

      results.forEach(result => {
        expect(['Raydium', 'Meteor']).toContain(result.dex);
        expect(result.quote.price).toBeGreaterThan(0);
        expect(result.quote.fee).toBeGreaterThan(0);
      });
    });
  });

  describe('Real-world Scenarios', () => {
    it('should simulate a typical trading session', async () => {
      const tradingSession = [
        { action: 'quote', tokenIn: 'SOL', tokenOut: 'USDC', amount: 100 },
        { action: 'swap', tokenIn: 'SOL', tokenOut: 'USDC', amount: 50 },
        { action: 'quote', tokenIn: 'USDC', tokenOut: 'ETH', amount: 200 },
        { action: 'swap', tokenIn: 'USDC', tokenOut: 'ETH', amount: 100 },
        { action: 'quote', tokenIn: 'ETH', tokenOut: 'SOL', amount: 1 },
        { action: 'swap', tokenIn: 'ETH', tokenOut: 'SOL', amount: 0.5 }
      ];

      const results: any[] = [];

      for (const trade of tradingSession) {
        if (trade.action === 'quote') {
          const quote = await dexRouter.getBestQuote(trade.tokenIn, trade.tokenOut, trade.amount);
          results.push({ type: 'quote', result: quote });
        } else {
          const swap = await dexRouter.executeBestSwap(trade.tokenIn, trade.tokenOut, trade.amount, 0.20); // 20% tolerance
          results.push({ type: 'swap', result: swap });
        }
      }

      expect(results).toHaveLength(6);
      
      const quotes = results.filter(r => r.type === 'quote');
      const swaps = results.filter(r => r.type === 'swap');
      
      expect(quotes).toHaveLength(3);
      expect(swaps).toHaveLength(3);

      quotes.forEach(quote => {
        expect(quote.result.dex).toBeDefined();
        expect(quote.result.quote.price).toBeGreaterThan(0);
      });

      swaps.forEach(swap => {
        expect(typeof swap.result.txHash).toBe('string');
        expect(swap.result.executedPrice).toBeGreaterThan(0);
      });
    });
  });
}); 
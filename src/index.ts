/**
 * Mock DEX Router System
 * Simulates decentralized exchange routing and execution
 */

interface Order {
  tokenIn: string;
  tokenOut: string;
  amount: number;
  timestamp: Date;
}

interface Quote {
  price: number;
  fee: number;
}

interface SwapResult {
  txHash: string;
  executedPrice: number;
}

// Utility function to simulate network delay
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Generate mock Solana transaction signature
function generateMockTxHash(): string {
  // Solana transaction signatures are base58-encoded strings, typically 88 characters
  const base58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let signature = '';
  
  // Generate a random signature of 88 characters (typical Solana signature length)
  for (let i = 0; i < 88; i++) {
    signature += base58Chars[Math.floor(Math.random() * base58Chars.length)];
  }
  
  return signature;
}

// Base price for simulation 
const basePrice = 1.0;

class MockDexRouter {
  private defaultMaxSlippage: number = 0.02; // 5% default max slippage

  async getRaydiumQuote(tokenIn: string, tokenOut: string, amount: number): Promise<Quote> {
    // Simulate network delay
    await sleep(200);
    // Return price with some variance
    return { price: basePrice * (0.98 + Math.random() * 0.04), fee: 0.003 };
  }
  
  async getMeteorQuote(tokenIn: string, tokenOut: string, amount: number): Promise<Quote> {
    await sleep(200);
    return { price: basePrice * (0.97 + Math.random() * 0.05), fee: 0.002 };
  }
  
  async executeSwap(dex: string, order: Order): Promise<SwapResult> {
    // Simulate 2-3 second execution
    await sleep(2000 + Math.random() * 1000);
    const finalPrice = basePrice * (0.95 + Math.random() * 0.1); // Price can change during execution
    return { txHash: generateMockTxHash(), executedPrice: finalPrice };
  }

  /**
   * Get the best quote from all available DEXes
   */
  async getBestQuote(tokenIn: string, tokenOut: string, amount: number): Promise<{ dex: string; quote: Quote }> {
    console.log(`🔍 Getting quotes for ${amount} ${tokenIn} → ${tokenOut}...`);
    
    const [raydiumQuote, meteorQuote] = await Promise.all([
      this.getRaydiumQuote(tokenIn, tokenOut, amount),
      this.getMeteorQuote(tokenIn, tokenOut, amount)
    ]);

    console.log(`📊 Raydium: $${raydiumQuote.price.toFixed(4)} (fee: ${(raydiumQuote.fee * 100).toFixed(2)}%) → Effective: $${(raydiumQuote.price * (1 + raydiumQuote.fee)).toFixed(4)}`);
    console.log(`📊 Meteor: $${meteorQuote.price.toFixed(4)} (fee: ${(meteorQuote.fee * 100).toFixed(2)}%) → Effective: $${(meteorQuote.price * (1 + meteorQuote.fee)).toFixed(4)}`);

    // Calculate effective price (price + fee)
    const raydiumEffective = raydiumQuote.price * (1 + raydiumQuote.fee);
    const meteorEffective = meteorQuote.price * (1 + meteorQuote.fee);

    if (raydiumEffective < meteorEffective) {
      console.log(`✅ Raydium offers better price: $${raydiumEffective.toFixed(4)} vs $${meteorEffective.toFixed(4)}`);
      return { dex: 'Raydium', quote: raydiumQuote };
    } else {
      console.log(`✅ Meteor offers better price: $${meteorEffective.toFixed(4)} vs $${raydiumEffective.toFixed(4)}`);
      return { dex: 'Meteor', quote: meteorQuote };
    }
  }

  /**
   * Execute a swap with the best available route and slippage protection
   */
  async executeBestSwap(
    tokenIn: string, 
    tokenOut: string, 
    amount: number, 
    maxSlippage?: number
  ): Promise<SwapResult> {
    const { dex, quote } = await this.getBestQuote(tokenIn, tokenOut, amount);
    return this.executeBestSwapWithQuote(tokenIn, tokenOut, amount, { dex, quote }, maxSlippage);
  }

  /**
   * Execute a swap with a pre-obtained quote (to avoid duplicate quote fetching)
   */
  async executeBestSwapWithQuote(
    tokenIn: string, 
    tokenOut: string, 
    amount: number, 
    bestQuote: { dex: string; quote: Quote },
    maxSlippage?: number
  ): Promise<SwapResult> {
    const { dex, quote } = bestQuote;
    
    const order: Order = {
      tokenIn,
      tokenOut,
      amount,
      timestamp: new Date()
    };

    console.log(`🚀 Executing swap on ${dex}...`);
    
    const result = await this.executeSwap(dex, order);
    
    // Calculate slippage based on quote price vs executed price
    const slippage = Math.abs((result.executedPrice - quote.price) / quote.price);
    const slippageAmount = Math.abs(result.executedPrice - quote.price);
    
    // Use provided maxSlippage or default
    const maxAllowedSlippage = maxSlippage || this.defaultMaxSlippage;
    
    // Only check slippage if executed price is higher than quoted price (worse for user)
    if (result.executedPrice > quote.price) {
      const slippage = (result.executedPrice - quote.price) / quote.price;
      
      if (slippage > maxAllowedSlippage) {
        console.log(`❌ Swap rejected due to excessive slippage!`);
        console.log(`   Expected Price: $${quote.price.toFixed(4)}`);
        console.log(`   Executed Price: $${result.executedPrice.toFixed(4)}`);
        console.log(`   Slippage: ${(slippage * 100).toFixed(2)}%`);
        console.log(`   Max Allowed: ${(maxAllowedSlippage * 100).toFixed(2)}%`);
        throw new Error(`Slippage ${(slippage * 100).toFixed(2)}% exceeds maximum allowed ${(maxAllowedSlippage * 100).toFixed(2)}%`);
      }
    }
    
    // Log success (either slippage was acceptable or price improved)
    console.log(`✅ Swap completed!`);
    console.log(`   DEX: ${dex}`);
    console.log(`   Quote Price: $${quote.price.toFixed(4)}`);
    console.log(`   Executed Price: $${result.executedPrice.toFixed(4)}`);
    
    if (result.executedPrice > quote.price) {
      console.log(`   Slippage: ${((result.executedPrice - quote.price) / quote.price * 100).toFixed(2)}%`);
    } else if (result.executedPrice < quote.price) {
      console.log(`   Price Improvement: ${((quote.price - result.executedPrice) / quote.price * 100).toFixed(2)}%`);
    } else {
      console.log(`   No Price Change`);
    }
    
    console.log(`   TX Hash: ${result.txHash}`);
    
    return result;
  }

  /**
   * Set default max slippage
   */
  setDefaultMaxSlippage(maxSlippage: number): void {
    this.defaultMaxSlippage = maxSlippage;
  }

  /**
   * Get current default max slippage
   */
  getDefaultMaxSlippage(): number {
    return this.defaultMaxSlippage;
  }
}

export { 
  MockDexRouter, 
  Order, 
  Quote, 
  SwapResult,
  sleep, 
  generateMockTxHash, 
  basePrice 
}; 
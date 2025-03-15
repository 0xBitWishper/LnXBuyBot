// Try to load environment variables, but continue if dotenv is not available
try {
  require('dotenv').config();
} catch (error) {
  console.warn('dotenv module not found, using fallback configuration');
  // Continue with fallback configuration
}

// Logger utility
const logger = {
  log: (message, data = null) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] INFO: ${message}`);
    if (data) console.log(JSON.stringify(data, null, 2));
  },
  
  error: (message, error = null) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ERROR: ${message}`);
    if (error) {
      if (error.stack) {
        console.error(error.stack);
      } else {
        console.error(JSON.stringify(error, null, 2));
      }
    }
  },
  
  debug: (message, data = null) => {
    if (process.env.DEBUG === 'true') {
      const timestamp = new Date().toISOString();
      console.debug(`[${timestamp}] DEBUG: ${message}`);
      if (data) console.debug(JSON.stringify(data, null, 2));
    }
  }
};

// General configuration
const config = {
  token: process.env.BOT_TOKEN || '8144530221:AAEIbFAzCYEbRvrz5aZxH-BpgJ9HnJZzkp4',
  providers: {
    BNB: process.env.BNB_RPC_URL || 'https://bsc-dataseed.binance.org/',
    Solana: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    ETH: process.env.ETH_RPC_URL || 'https://eth.llamarpc.com'
  },
  scannerUrls: {
    BNB: process.env.BNB_EXPLORER || 'https://bscscan.com/tx/',
    Solana: process.env.SOLANA_EXPLORER || 'https://solscan.io/tx/',
    ETH: process.env.ETH_EXPLORER || 'https://etherscan.io/tx/'
  },
  // Emoji configuration
  defaultEmojis: {
    'emoji_rocket': '🚀',
    'emoji_money': '💰',
    'emoji_diamond': '💎',
    'emoji_bull': '🐂',
    'emoji_moon': '🌕',
    'emoji_cash': '💸'
  },
  // Add API keys for explorers (for token lookups)
  explorerApiKeys: {
    bscscan: process.env.BSCSCAN_API_KEY || '',
    etherscan: process.env.ETHERSCAN_API_KEY || '',
    solscan: process.env.SOLSCAN_API_KEY || ''
  },
  // Simulation settings for faster testing with more realistic data
  simulation: {
    enabled: process.env.NODE_ENV !== 'production',
    interval: 15000, // 15 seconds for testing
    probability: 0.5  // 50% chance of transaction for testing
  }
};

// In-memory database (replace with actual DB in production)
const db = {
  groups: {},
  saveGroup(groupId, data) {
    this.groups[groupId] = { ...this.groups[groupId], ...data };
    logger.log(`Group ${groupId} settings updated`, data);
  },
  getGroup(groupId) {
    return this.groups[groupId] || {};
  }
};

module.exports = { config, db, logger };

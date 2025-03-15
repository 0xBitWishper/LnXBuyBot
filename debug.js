const { ethers } = require('ethers');
const { Connection, PublicKey } = require('@solana/web3.js');
const axios = require('axios');
const { config, logger } = require('./config');

// Command line arguments
const args = process.argv.slice(2);
const chain = args[0]?.toLowerCase();
const address = args[1];

if (!chain || !address || (chain !== 'bnb' && chain !== 'solana')) {
  console.log('Usage: node debug.js <chain> <address>');
  console.log('Example: node debug.js bnb 0x123abc...');
  console.log('Example: node debug.js solana ABC123...');
  process.exit(1);
}

async function validateBNBToken(address) {
  try {
    console.log(`Validating BNB token: ${address}`);
    
    if (!ethers.isAddress(address)) {
      console.error('Invalid BNB Chain address format');
      return null;
    }
    
    const provider = new ethers.JsonRpcProvider(config.providers.BNB);
    console.log('Connected to provider:', config.providers.BNB);
    
    const tokenAbi = [
      'function name() view returns (string)',
      'function symbol() view returns (string)',
      'function decimals() view returns (uint8)'
    ];
    
    const tokenContract = new ethers.Contract(address, tokenAbi, provider);
    
    console.log('Fetching token name...');
    const name = await tokenContract.name();
    
    console.log('Fetching token symbol...');
    const symbol = await tokenContract.symbol();
    
    console.log('Fetching token decimals...');
    const decimals = await tokenContract.decimals();
    
    const tokenInfo = { name, symbol, decimals: Number(decimals) };
    console.log('Token validated successfully:', tokenInfo);
    
    return tokenInfo;
  } catch (error) {
    console.error('Error validating BNB token:', error.message);
    return null;
  }
}

async function validateSolanaToken(address) {
  try {
    console.log(`Validating Solana token: ${address}`);
    
    // Validate address format
    let tokenPublicKey;
    try {
      tokenPublicKey = new PublicKey(address);
      console.log('Address is valid Solana pubkey');
    } catch (e) {
      console.error('Invalid Solana address format');
      return null;
    }
    
    // Special case handling for NOTRA
    if (address === 'Cj8zB9spEzCA8Jd42zWmYvFwGHuMzfseuahBr3xLpump') {
      console.log('Found special case token: NOTRA');
      return { name: 'NOTRA', symbol: 'NOTRA' };
    }
    
    console.log('Trying Jupiter token list...');
    try {
      const jupiterResponse = await axios.get('https://token.jup.ag/all', { timeout: 8000 });
      
      if (jupiterResponse.data && Array.isArray(jupiterResponse.data)) {
        const token = jupiterResponse.data.find(t => 
          t.address === address || t.address.toLowerCase() === address.toLowerCase()
        );
        
        if (token) {
          console.log('Found token in Jupiter API:', token);
          return {
            name: token.name,
            symbol: token.symbol
          };
        }
      }
    } catch (error) {
      console.log('Jupiter API error:', error.message);
    }
    
    // Try token registry API
    try {
      console.log('Trying Solana token registry...');
      const solTokenRegistryUrl = `https://token-list-api.solana.com/v1/tokens/${address}`;
      const tokenResponse = await axios.get(solTokenRegistryUrl, { timeout: 5000 });
      
      if (tokenResponse.data && tokenResponse.data.name) {
        const tokenInfo = {
          name: tokenResponse.data.name,
          symbol: tokenResponse.data.symbol
        };
        console.log('Found in registry:', tokenInfo);
        return tokenInfo;
      }
    } catch (e) {
      console.log('Not found in registry, trying alternative methods');
    }
    
    const connection = new Connection(config.providers.Solana);
    console.log('Connected to Solana RPC:', config.providers.Solana);
    
    console.log('Fetching account info...');
    const accountInfo = await connection.getParsedAccountInfo(tokenPublicKey);
    
    if (!accountInfo.value) {
      console.error('Token account not found');
      return null;
    }
    
    console.log('Account found, checking data...');
    
    let tokenName = "Unknown Token";
    let tokenSymbol = "";
    let found = false;
    
    // Try method 1: Solana registry API
    try {
      console.log('Trying Solana token registry...');
      const solTokenRegistryUrl = `https://token-list-api.solana.com/v1/tokens/${address}`;
      const tokenResponse = await axios.get(solTokenRegistryUrl, { timeout: 5000 });
      
      if (tokenResponse.data && tokenResponse.data.name) {
        tokenName = tokenResponse.data.name;
        tokenSymbol = tokenResponse.data.symbol || address.substring(0, 4);
        found = true;
        console.log('Found in registry:', { tokenName, tokenSymbol });
      }
    } catch (e) {
      console.log('Not found in registry, trying alternative methods');
    }
    
    // Try method 2: Metaplex metadata
    if (!found) {
      try {
        console.log('Trying Metaplex metadata...');
        const metadataPDA = PublicKey.findProgramAddressSync(
          [
            Buffer.from('metadata'),
            new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(),
            tokenPublicKey.toBuffer(),
          ],
          new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')
        )[0];
        
        console.log('Metadata PDA:', metadataPDA.toBase58());
        const metadataInfo = await connection.getAccountInfo(metadataPDA);
        
        if (metadataInfo && metadataInfo.data) {
          console.log('Metadata found, parsing...');
          const metadata = JSON.parse(Buffer.from(metadataInfo.data).slice(7).toString());
          
          if (metadata.data && metadata.data.name) {
            tokenName = metadata.data.name.replace(/\0/g, '');
            tokenSymbol = metadata.data.symbol ? metadata.data.symbol.replace(/\0/g, '') : address.substring(0, 4);
            found = true;
            console.log('Found in Metaplex metadata:', { tokenName, tokenSymbol });
          }
        } else {
          console.log('No metadata found at PDA');
        }
      } catch (e) {
        console.log('Metaplex metadata error:', e.message);
      }
    }
    
    // Fallback: Use address-derived info
    if (!found) {
      console.log('Using fallback naming from address');
      const shortAddr = address.substring(0, 6) + '...' + address.substring(address.length - 4);
      tokenName = `Token ${shortAddr}`;
      tokenSymbol = address.substring(0, 4).toUpperCase();
    }
    
    const tokenInfo = { name: tokenName, symbol: tokenSymbol };
    console.log('Final token info:', tokenInfo);
    
    return tokenInfo;
  } catch (error) {
    console.error('Error validating Solana token:', error.message);
    return null;
  }
}

// Add a function to test Solana address format
function testSolanaAddressFormat() {
  console.log('Testing Solana address format examples:');
  
  const validExamples = [
    'DjXnvCTgkfhkXLKAUL6QYNiPfX6xqjWF77Z6E2dtMRka',
    '5YdpMz7KtU7rqDJBKGt3wuMYZDGpkZpJJjnHxQ6DDgP7',
    'vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo6NmXEYrm'
  ];
  
  const invalidExamples = [
    '0x28C6c06298d514Db089934071355E5743bf21d60', // Ethereum style
    '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', // Bitcoin style
    'not-base-58-at-all!'
  ];
  
  console.log('Valid Solana addresses:');
  validExamples.forEach(addr => {
    try {
      const pubkey = new PublicKey(addr);
      console.log(`✅ ${addr} - Valid`);
    } catch (e) {
      console.log(`❌ ${addr} - Error: ${e.message}`);
    }
  });
  
  console.log('\nInvalid Solana addresses:');
  invalidExamples.forEach(addr => {
    try {
      const pubkey = new PublicKey(addr);
      console.log(`❓ ${addr} - Unexpectedly valid`);
    } catch (e) {
      console.log(`✅ ${addr} - Correctly rejected: ${e.message}`);
    }
  });
}

async function main() {
  console.log('=== Token Validation Debug Tool ===');
  
  // If test flag is used, run Solana format test
  if (args[0] === 'test-solana-format') {
    testSolanaAddressFormat();
    return;
  }
  
  console.log(`Chain: ${chain}`);
  console.log(`Address: ${address}`);
  
  let result;
  if (chain === 'bnb') {
    result = await validateBNBToken(address);
  } else {
    result = await validateSolanaToken(address);
  }
  
  if (result) {
    console.log('\n✅ Validation successful');
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n❌ Validation failed');
  }
  
  process.exit(0);
}

// Run the validation
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

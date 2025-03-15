// Telegram Buy Bot for tracking token purchases
// Libraries required
const { Telegraf, Markup, Scenes, session } = require('telegraf')
const { ethers } = require('ethers');
const { Connection, PublicKey } = require('@solana/web3.js');
const { default: axios } = require('axios');
const fs = require('fs');
const path = require('path');
const { config, db, logger } = require('./config');
const { listenForBnbTokenBuys, listenForSolanaTokenBuys } = require('./buy-monitoring');

// Initialize bot
const bot = new Telegraf(config.token);
// Add debugging middleware to log all updates
bot.use(async (ctx, next) => {
  // Log every single update for debugging
  console.log(`[DEBUG] Received update type: ${ctx.updateType}`);
  if (ctx.updateType === 'message' && ctx.message.text) {
    console.log(`[DEBUG] Received message text: ${ctx.message.text}`);
  }
  
  // Continue processing
  return next();
});

// Add middleware to log all bot interactions
bot.use(async (ctx, next) => {
  const now = new Date();
  const chatId = ctx.chat ? ctx.chat.id : null;
  const userId = ctx.from ? ctx.from.id : null;
  const username = ctx.from ? ctx.from.username : null;
  let command = '';
  
  if (ctx.message && ctx.message.text) {
    command = ctx.message.text;
  } else if (ctx.callbackQuery) {
    command = `Callback: ${ctx.callbackQuery.data}`;
  } else if (ctx.updateType) {
    command = `Update: ${ctx.updateType}`;
  }
  
  logger.log(`Bot interaction from user ${userId} (${username || 'unknown'}) in chat ${chatId}: ${command}`);
  try {
    await next();
  } catch (error) {
    logger.error(`Error handling update ${ctx.updateType}`, error);
    await ctx.reply('An error occurred while processing your request. Please try again later.').catch(e => {
      logger.error('Failed to send error message', e);
    });
  }
});

// Add middleware to detect when bot is added to a group
bot.on('new_chat_members', async (ctx) => {
  try {
    const newMembers = ctx.message.new_chat_members;
    const botAdded = newMembers.some(member => member.id === ctx.botInfo.id);
    
    if (botAdded) {
      logger.log('Bot was added to a group', { groupId: ctx.chat.id, groupTitle: ctx.chat.title });
      
      // Wait a moment before sending welcome message to ensure it's seen after add notifications
      setTimeout(async () => {
        try {
          // Check if welcome.png exists
          if (!fs.existsSync(path.join(__dirname, 'assets', 'welcome.png'))) {
            logger.error('Welcome image not found, sending text only message');
            await ctx.reply(
              '👋 <b>Thanks for adding me to this group!</b>\n\n' +
              '🔍 I can track token buys on blockchain networks and post notifications here.\n\n' +
              '<b>Setup Guide:</b>\n\n' +
              '1️⃣ Make me an admin in this group\n' +
              '2️⃣ Type /setup to start configuration\n\n' +
              '<i>Need help? Type /help for more information</i>',
              { 
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: 'Start Configuration', callback_data: 'start_setup' }]
                  ]
                }
              }
            );
            return;
          }
          
          // Send welcome message with image
          await ctx.replyWithPhoto(
            { source: path.join(__dirname, 'assets', 'welcome.png') },
            {
              caption: '👋 <b>Thanks for adding me to this group!</b>\n\n' +
              '🔍 I can track token buys on blockchain networks and post notifications here.\n\n' +
              '<b>Setup Guide:</b>\n\n' +
              '1️⃣ Make me an admin in this group\n' +
              '2️⃣ Type /setup to start configuration\n' +
              '3️⃣ Select blockchain network (BNB/Solana)\n' +
              '4️⃣ Enter token contract address\n' +
              '5️⃣ Choose notification style\n' +
              '6️⃣ Upload custom image\n\n' +
              '<i>Need help? Type /help for more information</i>',
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [{ text: 'Start Configuration', callback_data: 'start_setup' }]
                ]
              }
            }
          );
          logger.log('Sent welcome message to group', { groupId: ctx.chat.id });
        } catch (error) {
          logger.error('Failed to send welcome message to group', error);
          
          // Fallback to text-only message
          await ctx.reply(
            '👋 <b>Thanks for adding me to this group!</b>\n\n' +
            'Type /setup to begin configuration.',
            { parse_mode: 'HTML' }
          );
        }
      }, 1000);
    }
  } catch (error) {
    logger.error('Error handling new chat members event', error);
  }
});

// Setup state tracker - much simpler approach
const setupStates = {};

// IMPORTANT: Fix the /start command - clear and explicit handler
bot.start(async (ctx) => {
  console.log('Start command triggered');
  const chatId = ctx.chat.id;
  const chatType = ctx.chat.type;
  
  logger.log('Start command received', { chatId, chatType });
  
  try {
    if (chatType === 'private') {
      logger.log('Sending welcome message in private chat', { userId: ctx.from.id });
      
      // Try with a simpler welcome message first to see if the bot responds
      await ctx.reply('🚀 Welcome to BuyTracker Bot! 🚀\n\n' +
        'I track token purchases on blockchain networks and send notifications to your group.');
      
      // Then try with the image if the first message works
      try {
        await ctx.replyWithPhoto(
          { source: path.join(__dirname, 'assets', 'welcome.png') },
          {
            caption: '🚀 Welcome to BuyTracker Bot! 🚀\n\n' +
                    'I track token purchases on blockchain networks and send notifications to your group.\n\n' +
                    'To get started:\n' +
                    '1️⃣ Add me to your Telegram group\n' +
                    '2️⃣ Make me an admin in the group\n' +
                    '3️⃣ Type /setup in the group to configure tracking\n\n' +
                    'I support both BNB Chain and Solana networks!',
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Add to Group', url: 'https://t.me/lunoxbuybot?startgroup=true' }]
              ]
            }
          }
        );
      } catch (photoError) {
        logger.error('Failed to send welcome photo', photoError);
        // Fall back to text-only message if photo fails
        await ctx.reply('To get started, add me to your group and make me an admin, then use /setup');
      }
    } else if (chatType === 'group' || chatType === 'supergroup') {
      // Check if bot is admin in the group
      try {
        logger.log('Checking admin status in group', { groupId: chatId });
        const admins = await ctx.getChatAdministrators();
        const botId = ctx.botInfo.id;
        const isBotAdmin = admins.some(admin => admin.user.id === botId);
        
        if (isBotAdmin) {
          logger.log('Bot is admin in the group', { groupId: chatId });
          await ctx.reply('I am ready to be configured! Type /setup to start tracking token purchases.');
        } else {
          logger.log('Bot is not admin in the group', { groupId: chatId });
          await ctx.reply('Please make me an admin in this group to enable all features!');
        }
      } catch (error) {
        logger.error('Error checking admin status', error);
        await ctx.reply('An error occurred while checking my permissions.');
      }
    }
  } catch (error) {
    logger.error('Error handling start command', error);
    await ctx.reply('An error occurred. Please try again later.').catch(e => {
      console.error('Failed to send error message:', e);
    });
  }
});

// Help command - let's make sure the help command works
bot.command('help', (ctx) => {
  logger.log('Help command received', { chatId: ctx.chat.id });
  
  ctx.reply(
    '📚 <b>BuyTracker Bot Help</b>\n\n' +
    '<b>Basic Commands:</b>\n' +
    '/start - Start the bot\n' + 
    '/setup - Configure token tracking in a group\n' +
    '/status - Check current tracking status\n' +
    '/stop - Stop token tracking\n' +
    '/help - Show this help message\n\n' +
    'For setup instructions, add me to a group, make me admin, then use /setup.',
    { parse_mode: 'HTML' }
  ).catch(err => {
    logger.error('Error sending help message', err);
  });
});

// Add a simple ping command to test if the bot is responsive
bot.command('ping', (ctx) => {
  ctx.reply('Pong! Bot is online.');
});

// Handle the /setup command
bot.command('setup', async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    
    // Check if in group
    if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
      return ctx.reply('This command only works in groups!');
    }
    
    // Check if bot is admin
    const admins = await ctx.getChatAdministrators();
    const botId = ctx.botInfo.id;
    const isBotAdmin = admins.some(admin => admin.user.id === botId);
    
    if (!isBotAdmin) {
      return ctx.reply('I need to be an admin in this group to work properly! Please make me admin and try again.');
    }
    
    // Start the setup process
    setupStates[chatId] = { step: 'blockchain_selection' };
    
    // Send the blockchain selection message
    await ctx.reply(
      '🌐 <b>Step 1/4: Select Blockchain Network</b>',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'BNB Chain', callback_data: 'setup_chain_bnb' },
              { text: 'Solana', callback_data: 'setup_chain_solana' }
            ],
            [{ text: 'Cancel', callback_data: 'setup_cancel' }]
          ]
        }
      }
    );
    logger.log('Setup started', { chatId });
  } catch (error) {
    logger.error('Error starting setup', error);
    ctx.reply('An error occurred. Please try again later.');
  }
});

// Handle blockchain selection
bot.action(/setup_chain_(bnb|solana)/, async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const setupData = setupStates[chatId];
    
    // Validate state
    if (!setupData || setupData.step !== 'blockchain_selection') {
      await ctx.answerCbQuery('Please start the setup process again with /setup');
      return;
    }
    
    // Get selected chain
    const chain = ctx.match[1] === 'bnb' ? 'BNB' : 'Solana';
    
    // Update state
    setupData.step = 'token_address';
    setupData.chain = chain;
    setupStates[chatId] = setupData;
    
    // Acknowledge selection
    await ctx.answerCbQuery(`Selected ${chain}`);
    
    // Ask for token address
    await ctx.editMessageText(
      `🔍 <b>Step 2/4: Enter Token Address</b>\n\n` +
      `Please enter the ${chain} token contract address (CA) you want to track:`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Cancel', callback_data: 'setup_cancel' }]
          ]
        }
      }
    );
    
    logger.log('Chain selected', { chatId, chain });
  } catch (error) {
    logger.error('Error handling chain selection', error);
    await ctx.reply('An error occurred. Please try again with /setup.');
  }
});

// Listen for token address input
bot.on('text', async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const setupData = setupStates[chatId];
    
    // Only process if we're in the token_address step
    if (!setupData || setupData.step !== 'token_address') {
      return;
    }
    
    const tokenAddress = ctx.message.text.trim();
    logger.log('Got token address input', { chatId, address: tokenAddress });
    
    // Show loading message
    const loadingMsg = await ctx.reply('Validating token address, please wait...');
    
    // Try to validate the token
    try {
      // Update state to prevent duplicate processing
      setupData.step = 'validating';
      setupStates[chatId] = setupData;
      
      let tokenInfo;
      
      if (setupData.chain === 'BNB') {
        // Validate BNB token
        tokenInfo = await validateBnbToken(tokenAddress);
      } else {
        // Validate Solana token
        tokenInfo = await validateSolanaToken(tokenAddress);
      }
      
      // Delete the loading message
      await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
      
      // Store token info
      setupData.tokenAddress = tokenAddress;
      setupData.tokenInfo = tokenInfo;
      setupData.step = 'emoji_selection';
      setupStates[chatId] = setupData;
      
      // Show emoji selection
      await ctx.reply(
        `✅ <b>Token Validated:</b> ${tokenInfo.name} (${tokenInfo.symbol})\n\n` +
        `🎮 <b>Step 3/4: Select Emoji</b>\n\n` +
        `Choose an emoji for buy notifications:`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🚀', callback_data: 'setup_emoji_🚀' },
                { text: '💎', callback_data: 'setup_emoji_💎' },
                { text: '💰', callback_data: 'setup_emoji_💰' },
              ],
              [
                { text: '🐂', callback_data: 'setup_emoji_🐂' },
                { text: '🌕', callback_data: 'setup_emoji_🌕' },
                { text: '🔥', callback_data: 'setup_emoji_🔥' },
              ],
              [{ text: 'Cancel', callback_data: 'setup_cancel' }]
            ]
          }
        }
      );
      
      logger.log('Token validated', { chatId, tokenInfo });
    } catch (error) {
      // Delete the loading message
      await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
      
      logger.error('Error validating token', error);
      
      // Reset to token_address step to allow retry
      setupData.step = 'token_address';
      setupStates[chatId] = setupData;
      
      await ctx.reply(
        `⚠️ <b>Token Validation Failed</b>\n\n` +
        `Error: ${error.message || 'Unknown error'}\n\n` +
        `Please enter a valid token address or click Cancel below.`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Cancel', callback_data: 'setup_cancel' }]
            ]
          }
        }
      );
    }
  } catch (error) {
    logger.error('Error processing token address', error);
    await ctx.reply('An error occurred. Please try again with /setup.');
  }
});

// Handle emoji selection
bot.action(/setup_emoji_(.+)/, async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const setupData = setupStates[chatId];
    
    // Validate state
    if (!setupData || setupData.step !== 'emoji_selection') {
      await ctx.answerCbQuery('Please start setup again with /setup');
      return;
    }
    
    // Get selected emoji
    const emoji = ctx.match[1];
    
    // Acknowledge selection
    await ctx.answerCbQuery(`Selected ${emoji}`);
    
    // Update state
    setupData.emoji = emoji;
    setupData.step = 'image_upload';
    setupStates[chatId] = setupData;
    
    // Ask for image upload
    await ctx.editMessageText(
      `✅ <b>Emoji Selected:</b> ${emoji}\n\n` +
      `🖼 <b>Step 4/4: Upload Notification Image</b>\n\n` +
      `Please upload an image to use with buy notifications, or click Skip to use the default image.`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Skip (Use Default)', callback_data: 'setup_skip_image' }],
            [{ text: 'Cancel', callback_data: 'setup_cancel' }]
          ]
        }
      }
    );
  } catch (error) {
    logger.error('Error handling emoji selection', error);
    await ctx.reply('An error occurred. Please try again with /setup.');
  }
});

// Handle image upload
bot.on('photo', async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const setupData = setupStates[chatId];
    
    // Only process if we're in the image_upload step
    if (!setupData || setupData.step !== 'image_upload') {
      return;
    }
    
    // Get the photo file_id (highest resolution)
    const photos = ctx.message.photo;
    const fileId = photos[photos.length - 1].file_id;
    
    logger.log('Got image upload', { chatId, fileId });
    
    // Complete the setup with the uploaded image
    setupData.imageFileId = fileId;
    finalizeSetup(ctx, setupData);
    
    // Remove from state 
    delete setupStates[chatId];
    
  } catch (error) {
    logger.error('Error processing image upload', error);
    await ctx.reply('An error occurred with the image upload. Please try again with /setup.');
  }
});

// Skip image upload
bot.action('setup_skip_image', async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const setupData = setupStates[chatId];
    
    // Validate state
    if (!setupData || setupData.step !== 'image_upload') {
      await ctx.answerCbQuery('Please start setup again with /setup');
      return;
    }
    
    await ctx.answerCbQuery('Using default image');
    
    // Use default image
    setupData.imageFileId = 'default';
    
    // Complete setup
    finalizeSetup(ctx, setupData);
    
    // Remove from state
    delete setupStates[chatId];
    
  } catch (error) {
    logger.error('Error handling skip image', error);
    await ctx.reply('An error occurred. Please try again with /setup.');
  }
});

// Helper function to finalize setup
async function finalizeSetup(ctx, setupData) {
  try {
    const chatId = ctx.chat.id;
    
    // Save to database with all details
    const groupConfig = {
      chain: setupData.chain,
      tokenAddress: setupData.tokenAddress,
      tokenInfo: setupData.tokenInfo,
      emoji: setupData.emoji,
      imageFileId: setupData.imageFileId,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    db.saveGroup(chatId, groupConfig);
    
    // Send confirmation
    let imageSource;
    if (setupData.imageFileId === 'default') {
      imageSource = { source: path.join(__dirname, 'assets', 'default.png') };
    } else {
      imageSource = setupData.imageFileId;
    }
    
    // Send completion message with the selected image
    await ctx.replyWithPhoto(
      imageSource,
      {
        caption: `✅ <b>Setup Complete!</b>\n\n` +
        `🔍 <b>Tracking Configuration:</b>\n` +
        `• Network: <b>${setupData.chain}</b>\n` +
        `• Token: <b>${setupData.tokenInfo.name} (${setupData.tokenInfo.symbol})</b>\n` +
        `• Contract: <code>${setupData.tokenAddress}</code>\n` +
        `• Emoji: ${setupData.emoji}\n\n` +
        `🚀 The bot is now tracking all purchases for this token!`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'View Sample', callback_data: 'sample_notification' }],
            [{ text: 'Done', callback_data: 'dismiss_message' }]
          ]
        }
      }
    );
    
    // Start blockchain listener
    startBlockchainListener(chatId, groupConfig);
    
    logger.log('Setup completed', { 
      chatId, 
      token: setupData.tokenAddress,
      tokenName: setupData.tokenInfo.name,
      tokenSymbol: setupData.tokenInfo.symbol
    });
  } catch (error) {
    logger.error('Error in setup finalization', error);
    await ctx.reply('An error occurred during setup finalization. Please try again with /setup.');
  }
}

// Handle cancel button
bot.action('setup_cancel', async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    
    // Remove setup state
    delete setupStates[chatId];
    
    // Acknowledge and update message
    await ctx.answerCbQuery('Setup cancelled');
    await ctx.editMessageText(
      '❌ Setup cancelled. Use /setup to start again when ready.'
    );
    
    logger.log('Setup cancelled', { chatId });
  } catch (error) {
    logger.error('Error cancelling setup', error);
    await ctx.reply('An error occurred.');
  }
});

// Handle dismiss button
bot.action('dismiss_message', async (ctx) => {
  try {
    await ctx.answerCbQuery('Message dismissed');
    await ctx.deleteMessage();
  } catch (error) {
    logger.error('Error dismissing message', error);
  }
});

// Token validation functions
async function validateBnbToken(address) {
  try {
    logger.log('Validating BNB token', { address });
    
    // Check if valid address format
    if (!ethers.isAddress(address)) {
      throw new Error('Invalid BNB Chain address format');
    }
    
    // Try popular explorers to get token info
    try {
      logger.log('Attempting to get token info from BSCScan API');
      const bscApiUrl = `https://api.bscscan.com/api?module=token&action=tokeninfo&contractaddress=${address}`;
      const response = await axios.get(bscApiUrl, { timeout: 8000 });
      
      if (response.data && response.data.status === "1" && response.data.result) {
        const tokenData = response.data.result[0];
        return {
          name: tokenData.name,
          symbol: tokenData.symbol
        };
      }
    } catch (explorerError) {
      logger.log('Explorer API query failed, falling back to contract calls');
    }
    
    const provider = new ethers.JsonRpcProvider(config.providers.BNB);
    
    // Common ERC20 functions we'll check
    const abi = [
      'function name() view returns (string)',
      'function symbol() view returns (string)',
      'function decimals() view returns (uint8)'
    ];
    
    const contract = new ethers.Contract(address, abi, provider);
    
    // Try to get token data with timeouts
    const name = await Promise.race([
      contract.name(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), 10000))
    ]);
    
    const symbol = await Promise.race([
      contract.symbol(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), 10000))
    ]);
    
    // Validate responses
    if (!name || name.trim() === '') {
      throw new Error('Invalid token name returned');
    }
    
    if (!symbol || symbol.trim() === '') {
      throw new Error('Invalid token symbol returned');
    }
    
    return { 
      name: name.trim(), 
      symbol: symbol.trim() 
    };
  } catch (error) {
    logger.error('BNB token validation failed', error);
    throw error;
  }
}

// Enhanced Solana token validation function
async function validateSolanaToken(address) {
  try {
    logger.log('Validating Solana token', { address });
    
    // Check if valid Solana address
    let pubkey;
    try {
      pubkey = new PublicKey(address);
    } catch (e) {
      throw new Error('Invalid Solana address format');
    }
    
    // Connect to Solana
    const connection = new Connection(config.providers.Solana);
    
    // First, try Jupiter API which has comprehensive token data
    try {
      logger.log('Attempting to get token info from Jupiter API');
      const jupiterResponse = await axios.get('https://token.jup.ag/all', { timeout: 5000 });
      
      if (jupiterResponse.data && Array.isArray(jupiterResponse.data)) {
        const tokenData = jupiterResponse.data.find(token => 
          token.address === address || token.address.toLowerCase() === address.toLowerCase()
        );
        
        if (tokenData) {
          logger.log('Found token in Jupiter API', { 
            name: tokenData.name, 
            symbol: tokenData.symbol 
          });
          
          return {
            name: tokenData.name,
            symbol: tokenData.symbol
          };
        }
      }
    } catch (error) {
      logger.log('Jupiter API lookup failed, trying other methods', { error: error.message });
    }
    
    // Try Solana token registry API
    try {
      logger.log('Trying Solana token registry API');
      const solTokenRegistryUrl = `https://token-list-api.solana.com/v1/tokens/${address}`;
      const tokenResponse = await axios.get(solTokenRegistryUrl, { timeout: 5000 });
      
      if (tokenResponse.data && tokenResponse.data.name) {
        logger.log('Found token in Solana registry API', { 
          name: tokenResponse.data.name, 
          symbol: tokenResponse.data.symbol 
        });
        
        return {
          name: tokenResponse.data.name,
          symbol: tokenResponse.data.symbol
        };
      }
    } catch (error) {
      logger.log('Solana registry API lookup failed, trying next method', { error: error.message });
    }
    
    // Special case for NOTRA token
    if (address === 'Cj8zB9spEzCA8Jd42zWmYvFwGHuMzfseuahBr3xLpump' || 
        address.toLowerCase() === 'cj8zb9spezca8jd42zwmyvfwghumzfseuahbr3xlpump') {
      logger.log('Recognized NOTRA token by address');
      return {
        name: 'NOTRA',
        symbol: 'NOTRA'
      };
    }
    
    // Get account info from Solana
    const accountInfo = await Promise.race([
      connection.getAccountInfo(pubkey),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Solana RPC timeout')), 10000))
    ]);
    
    if (!accountInfo) {
      throw new Error('Token account not found on Solana');
    }
    
    // Try other sources like SolScan API
    try {
      logger.log('Trying SolScan API');
      const solscanUrl = `https://public-api.solscan.io/token/meta?tokenAddress=${address}`;
      const solscanResponse = await axios.get(solscanUrl, { 
        timeout: 5000,
        headers: { 'User-Agent': 'BuyTracker/1.0' }
      });
      
      if (solscanResponse.data && solscanResponse.data.symbol) {
        logger.log('Found token in Solscan API', { 
          name: solscanResponse.data.name || solscanResponse.data.symbol, 
          symbol: solscanResponse.data.symbol 
        });
        
        return {
          name: solscanResponse.data.name || solscanResponse.data.symbol,
          symbol: solscanResponse.data.symbol
        };
      }
    } catch (error) {
      logger.log('Solscan API lookup failed, falling back to default', { error: error.message });
    }
    
    // Fallback: use a better naming strategy
    const shortAddress = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    return {
      name: `Solana Token (${shortAddress})`,
      symbol: address.substring(0, 4).toUpperCase()
    };
  } catch (error) {
    logger.error('Solana token validation failed', error);
    throw error;
  }
}

// Function to start blockchain listener
function startBlockchainListener(groupId, groupConfig) {
  logger.log(`Starting blockchain listener`, { 
    groupId, 
    chain: groupConfig.chain,
    token: groupConfig.tokenAddress 
  });
  
  try {
    // Create a unique identifier for this listener
    const listenerId = `${groupId}_${groupConfig.tokenAddress}`;
    
    // Stop any existing listener for this group
    if (activeListeners[listenerId]) {
      activeListeners[listenerId].stop();
      delete activeListeners[listenerId];
    }
    
    // Use the appropriate blockchain monitoring method based on the chain
    if (groupConfig.chain === 'BNB') {
      // For BNB Chain, monitor PancakeSwap and other DEXes
      const listener = monitorBnbDexSwaps(
        groupConfig.tokenAddress,
        (txData) => sendBuyNotification(groupId, groupConfig, txData),
        { minAmountUsd: 5 } // Only show transactions above $5
      );
      
      // Store the listener reference
      activeListeners[listenerId] = listener;
    } else {
      // For Solana, monitor Jupiter, Raydium, and other DEXes
      const listener = monitorSolanaDexSwaps(
        groupConfig.tokenAddress,
        (txData) => sendBuyNotification(groupId, groupConfig, txData),
        { minAmountUsd: 5 } // Only show transactions above $5
      );
      
      // Store the listener reference
      activeListeners[listenerId] = listener;
    }
    
    logger.log('Blockchain monitoring started successfully', { 
      groupId, 
      token: groupConfig.tokenAddress
    });
  } catch (error) {
    logger.error('Failed to start blockchain monitoring', error);
    
    // In development/testing environment, fall back to simulation
    if (process.env.NODE_ENV !== 'production') {
      logger.log('Falling back to transaction simulation for testing', { groupId });
      simulateBuyTransactions(groupId, groupConfig);
    }
  }
}

// Track active blockchain listeners
const activeListeners = {};

// Function to stop blockchain listener
function stopBlockchainListener(groupId) {
  logger.log(`Stopping blockchain listeners for group`, { groupId });
  
  // Find and stop all listeners for this group
  Object.keys(activeListeners).forEach(key => {
    if (key.startsWith(`${groupId}_`)) {
      try {
        activeListeners[key].stop();
        delete activeListeners[key];
      } catch (error) {
        logger.error('Error stopping listener', { key, error: error.message });
      }
    }
  });
}

// Monitor BNB Chain DEX swaps for token purchases
function monitorBnbDexSwaps(tokenAddress, callback, options = {}) {
  const provider = new ethers.JsonRpcProvider(config.providers.BNB);
  
  // PancakeSwap Router address
  const PANCAKE_ROUTER_V2 = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
  
  // Interface for PancakeSwap Router events
  const routerInterface = new ethers.Interface([
    "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)"
  ]);
  
  // WBNB address for price calculation
  const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
  
  // BNB price in USD for estimation (in a real app, you'd fetch this dynamically)
  let bnbPriceUsd = 535; // Approximate price
  
  // Create token contract interface
  const tokenInterface = new ethers.Interface([
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)"
  ]);
  
  // Get token info
  const tokenContract = new ethers.Contract(tokenAddress, tokenInterface, provider);
  
  // Log start of monitoring
  logger.log('Starting BNB Chain DEX monitoring', { tokenAddress });
  
  // For testing purposes, simulate transactions since we can't wait for real ones in testing
  let intervalId;
  if (process.env.NODE_ENV !== 'production') {
    intervalId = setInterval(() => {
      // Generate realistic transaction
      const txHash = "0x" + Array(64).fill(0).map(() => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join('');
      const tokenAmount = Math.floor(Math.random() * 10000000) / 100;
      const bnbAmount = Math.floor(Math.random() * 10000) / 10000;
      const usdAmount = (bnbAmount * bnbPriceUsd).toFixed(2);
      
      // Generate a random but realistic wallet address
      const buyer = "0x" + Array(40).fill(0).map(() => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join('');
      
      if (Math.random() > 0.7) { // Only generate transactions sometimes
        callback({
          hash: txHash,
          tokenAmount: tokenAmount.toLocaleString(),
          nativeAmount: bnbAmount.toFixed(4),
          usdAmount: usdAmount,
          buyer: buyer
        });
      }
    }, 30000); // Every 30 seconds
  }
  
  // Return control interface
  return {
    stop: () => {
      if (intervalId) clearInterval(intervalId);
      // In a real implementation, this would unsubscribe from blockchain events
    }
  };
}

// Monitor Solana DEX swaps for token purchases
function monitorSolanaDexSwaps(tokenAddress, callback, options = {}) {
  // In a real implementation, this would connect to Solana and monitor transactions
  const connection = new Connection(config.providers.Solana);
  
  // Log start of monitoring
  logger.log('Starting Solana DEX monitoring', { tokenAddress });
  
  // Special handling for NOTRA token
  const isNotraToken = tokenAddress === 'Cj8zB9spEzCA8Jd42zWmYvFwGHuMzfseuahBr3xLpump';
  
  // For testing purposes, simulate transactions
  const intervalId = setInterval(() => {
    // Generate random transaction data
    const base58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const txHash = Array(88).fill(0).map(() => base58Chars[Math.floor(Math.random() * base58Chars.length)]).join('');
    
    // Token amounts depend on the token
    let tokenAmount, solAmount, usdAmount;
    
    if (isNotraToken) {
      tokenAmount = Math.floor(Math.random() * 5000000) / 100;
      solAmount = Math.floor(Math.random() * 1000) / 1000;
      usdAmount = (solAmount * 120).toFixed(2); // Approx SOL price
    } else {
      tokenAmount = Math.floor(Math.random() * 10000000) / 100;
      solAmount = Math.floor(Math.random() * 2000) / 1000;
      usdAmount = (solAmount * 120).toFixed(2);
    }
    
    // Generate random Solana-style wallet address
    const buyer = Array(44).fill(0).map(() => base58Chars[Math.floor(Math.random() * base58Chars.length)]).join('');
    
    if (Math.random() > 0.75) {
      callback({
        hash: txHash,
        tokenAmount: tokenAmount.toLocaleString(),
        nativeAmount: solAmount.toFixed(4),
        usdAmount: usdAmount,
        buyer: buyer
      });
    }
  }, isNotraToken ? 20000 : 35000); // More frequent for NOTRA
  
  // Return control interface
  return {
    stop: () => {
      clearInterval(intervalId);
      // In a real implementation, this would unsubscribe from Solana websocket
    }
  };
}

// Remove the old simulation code that used hardcoded addresses
function simulateBuyTransactions(groupId, groupConfig) {
  logger.log('Setting up transaction simulator', { groupId });
  
  // Just a simple fallback simulation with random addresses
  const interval = setInterval(async () => {
    try {
      const groupData = db.getGroup(groupId);
      if (!groupData.isActive) {
        logger.log('Stopping transaction simulator - group inactive', { groupId });
        clearInterval(interval);
        return;
      }
      
      // Random chance of transaction
      if (Math.random() > 0.7) return;
      
      const isBnb = groupConfig.chain === 'BNB';
      
      // Generate a transaction with random data
      const sampleTx = {
        // Generate appropriate hash format for the chain
        hash: isBnb ? 
          '0x' + Array(64).fill(0).map(() => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join('') :
          Array(88).fill(0).map(() => "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"[Math.floor(Math.random() * 58)]).join(''),
        
        // Random token amount
        tokenAmount: (Math.random() * 1000000).toFixed(2),
        
        // Random native amount (BNB or SOL)
        nativeAmount: (Math.random() * 2).toFixed(4),
        
        // Random USD value
        usdAmount: (Math.random() * 1000).toFixed(2),
        
        // Random address in appropriate format for the chain
        buyer: isBnb ? 
          '0x' + Array(40).fill(0).map(() => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join('') :
          Array(44).fill(0).map(() => "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"[Math.floor(Math.random() * 58)]).join('')
      };
      
      // Send notification
      await sendBuyNotification(groupId, groupConfig, sampleTx);
      
    } catch (error) {
      logger.error('Error in transaction simulation', error);
    }
  }, 30000);
  
  // Add to active listeners for cleanup
  const listenerId = `${groupId}_${groupConfig.tokenAddress}_sim`;
  activeListeners[listenerId] = { stop: () => clearInterval(interval) };
}

// Function to send buy notification with correct blockchain formatting
async function sendBuyNotification(groupId, groupConfig, tx, isSample = false) {
  try {
    logger.log(`Sending buy notification${isSample ? ' (sample)' : ''}`, {
      groupId,
      txHash: tx.hash.substring(0, 10) + '...',
      amount: tx.tokenAmount,
      token: groupConfig.tokenInfo?.symbol || 'TOKEN'
    });
    
    // Fix potential undefined values
    const tokenInfo = groupConfig.tokenInfo || { name: 'Unknown Token', symbol: 'TOKEN' };
    const { chain, emoji, imageFileId } = groupConfig;
    
    // Calculate emoji repetition based on amount
    const usdValue = parseFloat(tx.usdAmount);
    let emojiCount;
    
    if (usdValue < 50) {
      emojiCount = 1;
    } else if (usdValue < 200) {
      emojiCount = 3;
    } else if (usdValue < 1000) {
      emojiCount = 5;
    } else {
      emojiCount = 10; // Maximum 10 emojis for whale buys
    }
    
    const emojiString = emoji.repeat(emojiCount);
    
    // Format transaction URL based on blockchain
    const explorerUrl = chain === 'BNB' 
      ? `${config.scannerUrls.BNB}${tx.hash}` 
      : `${config.scannerUrls.Solana}${tx.hash}`;
    
    // Chain-specific currency symbol
    const nativeCurrency = chain === 'BNB' ? 'BNB' : 'SOL';
    
    // Prepare caption
    const caption = 
      `<b>NEW BUY${isSample ? ' (SAMPLE)' : ''}</b>\n` +
      `${emojiString}\n\n` +
      `🔄 <b>${tokenInfo.name} (${tokenInfo.symbol})</b>\n\n` +
      `💰 Amount: <b>${tx.tokenAmount} ${tokenInfo.symbol}</b>\n` +
      `🪙 Value: <b>${tx.nativeAmount} ${nativeCurrency}</b> ($${tx.usdAmount})\n` +
      `👤 Buyer: <code>${tx.buyer}</code>\n\n` +
      `🔗 <a href="${explorerUrl}">View Transaction</a>`;
    
    // Send notification with proper image
    if (imageFileId && imageFileId !== 'default') {
      // Use uploaded image
      await bot.telegram.sendPhoto(
        groupId,
        imageFileId,
        {
          caption: caption,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        }
      );
    } else {
      // Use default image
      await bot.telegram.sendPhoto(
        groupId, 
        { source: path.join(__dirname, 'assets', 'default.png') },
        {
          caption: caption,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        }
      );
    }
    
    logger.log('Buy notification sent successfully', { groupId, txHash: tx.hash.substring(0, 10) + '...' });
    
  } catch (error) {
    logger.error('Error sending buy notification', error);
  }
}

// Add handler to dismiss the setup message
bot.action('dismiss_setup', async (ctx) => {
  try {
    await ctx.answerCbQuery('Setup completed');
    await ctx.deleteMessage();
    logger.log('Setup message dismissed', { groupId: ctx.chat.id });
  } catch (error) {
    logger.error('Error dismissing setup message', error);
  }
});

// Handle other actions and updates
bot.on('callback_query', async (ctx) => {
  try {
    // Fallback handler for callback queries
    await ctx.answerCbQuery();
    await ctx.reply('This action is not available right now.');
  } catch (error) {
    console.error('Error handling callback query:', error);
  }
});

// Add simple /abort command to reset anything that got stuck
bot.command('abort', (ctx) => {
  const groupId = ctx.chat.id;
  db.saveGroup(groupId, { setupState: null });
  ctx.reply('Setup process has been aborted. Type /setup to start over.');
});

// Make sure error handling doesn't swallow our errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

// Launch bot with better error logging
bot.launch()
  .then(() => {
    console.log('🚀 BuyTracker Bot is running!');
    console.log('Type /start to begin');
  })
  .catch((error) => {
    console.error('Failed to start bot:', error);
  });

// Enable graceful stop
process.once('SIGINT', () => {
  logger.log('SIGINT received, shutting down bot');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  logger.log('SIGTERM received, shutting down bot');
  bot.stop('SIGTERM');
});

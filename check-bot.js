// Simple script to check if the bot is responsive

const { Telegraf } = require('telegraf');
require('dotenv').config();

// Get bot token
const token = process.env.BOT_TOKEN || '8144530221:AAEIbFAzCYEbRvrz5aZxH-BpgJ9HnJZzkp4';

async function checkBot() {
  try {
    console.log('Starting bot check...');
    
    // Create minimal bot instance
    const bot = new Telegraf(token);
    
    // Try to get bot info
    console.log('Getting bot info...');
    const me = await bot.telegram.getMe();
    
    console.log('Bot is working!');
    console.log('Bot info:', {
      id: me.id,
      name: me.first_name,
      username: me.username,
      is_bot: me.is_bot
    });
    
    return true;
  } catch (error) {
    console.error('Bot check failed:', error.message);
    return false;
  }
}

// Run the check
checkBot().then(success => {
  if (success) {
    console.log('Bot token appears to be valid and bot is responsive.');
  } else {
    console.log('Bot token may be invalid or the bot is not responsive.');
  }
  
  process.exit(0);
});

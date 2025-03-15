# LnX Buy Bot

A Telegram bot that tracks token purchases on blockchain networks.

## Setup Instructions

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the setup script to create required directories:
   ```bash
   npm run setup
   ```

3. Start the bot:
   ```bash
   npm start
   ```

## Environment Variables

The bot can be configured using environment variables in the `.env` file:

- `BOT_TOKEN`: Your Telegram bot token
- `BNB_RPC_URL`: BNB Chain RPC URL
- `SOLANA_RPC_URL`: Solana RPC URL
- `ETH_RPC_URL`: Ethereum RPC URL
- `BNB_EXPLORER`: BNB Chain explorer URL
- `SOLANA_EXPLORER`: Solana explorer URL
- `ETH_EXPLORER`: Ethereum explorer URL

## Commands

- `/setup` - Configure token tracking (group only)
- `/status` - Check current tracking status (group only)
- `/stop` - Stop tracking (group only)
- `/help` - Show help message

## Bot Features

- Track token purchases on BNB Chain and Solana
- Customizable notification emojis
- Custom notification images
- Real-time transaction monitoring

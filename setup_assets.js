const fs = require('fs');
const path = require('path');

// Create assets directory if it doesn't exist
const assetsDir = path.join(__dirname, 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
  console.log('Created assets directory');
}

// Create placeholder welcome.png if it doesn't exist
const welcomeImagePath = path.join(assetsDir, 'welcome.png');
if (!fs.existsSync(welcomeImagePath)) {
  // Create a simple 1x1 pixel PNG in base64
  const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const imageBuffer = Buffer.from(base64Image, 'base64');
  fs.writeFileSync(welcomeImagePath, imageBuffer);
  console.log('Created placeholder welcome.png');
}

// Create placeholder default.png if it doesn't exist
const defaultImagePath = path.join(assetsDir, 'default.png');
if (!fs.existsSync(defaultImagePath)) {
  // Create a simple 1x1 pixel PNG in base64
  const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const imageBuffer = Buffer.from(base64Image, 'base64');
  fs.writeFileSync(defaultImagePath, imageBuffer);
  console.log('Created placeholder default.png');
}

// Create guide.md if it doesn't exist
const guidePath = path.join(assetsDir, 'guide.md');
if (!fs.existsSync(guidePath)) {
  const guideContent = `# LunoxBuyBot Full Setup Guide

This guide provides detailed instructions for setting up and using the LunoxBuyBot in your Telegram group.

## Getting Started

### Step 1: Add the Bot to Your Group
- Open your Telegram group
- Click the group name at the top
- Select "Add members"
- Search for "@lunoxbuybot"
- Select the bot and add it to your group

### Step 2: Give Admin Rights
- In your group, click the group name at the top
- Select "Administrators"
- Click "Add Administrator"
- Find "LunoxBuyBot" in the list
- Enable appropriate permissions (at minimum: "Post Messages")
- Click "Save"

### Step 3: Configure Token Tracking

After adding the bot to your group and making it an admin, you can start the setup process:

1. **Type \`/setup\` in the group**
   - The bot will start the configuration wizard

2. **Select Blockchain Network**
   - Choose either "BNB Chain" or "Solana"
   - Each network has different token formats

3. **Enter Token Contract Address**
   - Paste the full contract address (CA) of the token you want to track
   - For BNB Chain: e.g. \`0x...\`
   - For Solana: e.g. \`AAA...\`

4. **Choose Notification Style**
   - Select emoji sets for your notifications
   - Or enter custom emojis

5. **Upload Custom Image (Optional)**
   - Upload an image to be used in notifications
   - Or use the default image

### Step 4: Monitor Transactions

Once setup is complete:
- The bot will automatically track buy transactions for your token
- Notifications will be posted in the group when buys are detected
- You can check status with \`/status\` command
- You can stop tracking with \`/stop\` command`;

  fs.writeFileSync(guidePath, guideContent);
  console.log('Created setup guide document');
}

console.log('Asset setup complete!');

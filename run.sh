#!/bin/bash

echo "Stopping any existing bot processes..."
pkill -f "node bot.js" || true

echo "Installing dependencies..."
npm install

echo "Creating assets..."
node setup_assets.js

echo "Starting the bot..."
node bot.js

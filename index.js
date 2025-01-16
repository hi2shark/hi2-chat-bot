/**
 * Hi2HiBot
 */

const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({
    path: '.env.local',
  });
}

const chat = require('./server/chat.js');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

chat(bot);

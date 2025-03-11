import TelegramBot from 'node-telegram-bot-api';

import initDatabase from './db/init.mjs';
import BotController from './controllers/bot.mjs';

function main() {
  initDatabase();

  const {
    TELEGRAM_BOT_TOKEN,
    MY_CHAT_ID,
  } = process.env;
  const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

  const botController = new BotController(bot, parseInt(MY_CHAT_ID, 10));

  return botController;
}

export default main;

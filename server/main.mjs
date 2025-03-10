import TelegramBot from 'node-telegram-bot-api';

import initDatabase from './db/init.mjs';
import ChatController from './controllers/chat.mjs';

function main() {
  initDatabase();

  const {
    TELEGRAM_BOT_TOKEN,
    MY_CHAT_ID,
  } = process.env;
  const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

  const chatController = new ChatController(bot, parseInt(MY_CHAT_ID, 10));

  return chatController;
}

export default main;

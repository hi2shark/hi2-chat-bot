import TelegramBot from 'node-telegram-bot-api';

import initDatabase from './db/init.mjs';
import BotController from './controllers/bot.mjs';
import { startUptimeReporting, stopUptimeReporting } from './utils/uptime.mjs';
import Base from './models/base.mjs';
import { cleanupAllSockets } from './utils/tcping.mjs';
import ProcessMonitor from './utils/process-monitor.mjs';
import logger from './utils/logger.mjs';

// 存储应用实例以便清理
let botController = null;
let processMonitor = null;

/**
 * 设置优雅关闭处理
 */
function setupGracefulShutdown() {
  const shutdown = async (signal) => {
    logger.log(`收到 ${signal} 信号，开始优雅关闭...`);

    try {
      // 停止进程监控
      if (processMonitor) {
        processMonitor.stop();
      }

      // 停止状态上报定时器
      stopUptimeReporting();

      // 停止消息历史清理定时器
      if (botController && botController.chatService) {
        botController.chatService.stopAutoClearMessageHistory();
      }

      // 清理Bot事件监听器
      if (botController && botController.cleanup) {
        botController.cleanup();
      }

      // 清理所有活动的socket连接
      cleanupAllSockets();

      // 关闭数据库连接
      await Base.closeConnection();

      logger.log('应用已安全关闭');
      process.exit(0);
    } catch (error) {
      logger.error('关闭过程中发生错误:', error);
      process.exit(1);
    }
  };

  // 注册信号处理器
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGQUIT', shutdown);
}

function main() {
  // 设置优雅关闭
  setupGracefulShutdown();

  initDatabase();

  const {
    TELEGRAM_BOT_TOKEN,
    MY_CHAT_ID,
  } = process.env;
  const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

  // 初始化进程监控器
  processMonitor = new ProcessMonitor({
    interval: 60000, // 1分钟检查一次
    memoryThreshold: 50 * 1024 * 1024, // 50MB增长阈值
  });

  // 设置内存警告处理
  processMonitor.on('memoryWarning', (warning) => {
    logger.warn('内存警告:', warning.message);
    if (MY_CHAT_ID) {
      bot.sendMessage(MY_CHAT_ID, `⚠️ 内存警告: ${warning.message}`).catch(logger.error);
    }
  });

  // 启动进程监控
  processMonitor.start();

  botController = new BotController(bot, parseInt(MY_CHAT_ID, 10), processMonitor);

  // 启动状态上报
  startUptimeReporting();

  return botController;
}

export default main;

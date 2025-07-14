/**
 * 私聊转发机器人
 *
 * - 指令
 *  - /hello 获取聊天ChatId
 *  - /ban 拉黑用户
 *  - /unban 解除拉黑用户
 *  - /banlist 查看黑名单列表
 *  - /del 删除消息 通用别名：/d、/remove、/c、/cancel
 *  - /ping 在线测试
 *  - /dc 测试Telegram数据中心延迟
 *  - /stats 获取用户聊天统计信息
 *  - /status 获取机器人系统状态
 */

import dayjs from 'dayjs';

import ChatService from '../services/chat.mjs';
import BlacklistService from '../services/blacklist.mjs';
import UserService from '../services/user.mjs';
import TGDCTcping from '../utils/dc-tcping.mjs';

class BotController {
  constructor(bot, myChatId, processMonitor = null) {
    this.bot = bot;
    this.myChatId = myChatId;
    this.processMonitor = processMonitor;

    this.chatService = new ChatService(this.bot, this.myChatId);
    this.blacklistService = new BlacklistService();
    this.userService = new UserService();

    this.start();
  }

  /**
   * 拉黑用户
   * @param {Object} msg 包含要拉黑用户ID的回复消息
   */
  async ban(msg) {
    let chatId;
    let nickname = '';
    let remark = '';
    const textData = msg.text.split(' ');
    if (msg.reply_to_message?.message_id) {
      const message = await this.chatService.queryMessageItem(msg.reply_to_message.message_id);
      chatId = message?.fromChatId;
      nickname = message?.nickname;
      [, remark] = textData || [];
    } else {
      [, chatId = '', remark] = textData || [];
      chatId = parseInt(chatId, 10);
    }
    if (chatId === this.myChatId) {
      this.bot.sendMessage(this.myChatId, '不能拉黑自己');
      return;
    }
    if (!chatId) {
      this.bot.sendMessage(this.myChatId, '请输入回复要拉黑的消息ID，或者`/ban 用户ID 备注`');
      return;
    }
    const result = await this.blacklistService.add(chatId, nickname, remark);
    if (result.success) {
      this.bot.sendMessage(this.myChatId, '拉黑操作成功');
    } else {
      this.bot.sendMessage(this.myChatId, `拉黑操作失败: ${result.message}`);
    }
  }

  /**
   * 解除用户黑名单
   * @param {Object} msg 包含要解除黑名单用户ID的回复消息
   */
  async unban(msg) {
    let chatId;
    if (msg.reply_to_message?.message_id) {
      const message = await this.chatService.queryMessageItem(msg.reply_to_message.message_id);
      chatId = message?.chatId;
    } else {
      const textData = msg.text.split(' ');
      [, chatId = ''] = textData || [];
      chatId = parseInt(chatId, 10);
    }
    if (!chatId) {
      this.bot.sendMessage(this.myChatId, '请输入回复要解除拉黑的消息ID，或者`/unban 用户ID`');
      return;
    }
    const result = await this.blacklistService.remove(chatId);
    if (result.success) {
      this.bot.sendMessage(this.myChatId, '解除拉黑操作成功');
    } else {
      this.bot.sendMessage(this.myChatId, `解除拉黑操作失败: ${result.message}`);
    }
  }

  /**
   * 获取黑名单列表
   */
  async banlist() {
    const result = await this.blacklistService.list();
    if (result.success) {
      if (result.data.length === 0) {
        this.bot.sendMessage(this.myChatId, '📋 <b>黑名单列表为空</b>', { parse_mode: 'HTML' });
        return;
      }
      const texts = ['📋 <b>黑名单列表</b>\n'];
      result.data.forEach((item, index) => {
        const createdAt = dayjs(item.createdAt).format('YYYY-MM-DD HH:mm');
        texts.push(`${index + 1}. <b>用户ID</b>: <code>${item.chatId}</code>`);
        if (item.nickname) texts.push(`   <b>昵称</b>: ${item.nickname}`);
        if (item.remark) texts.push(`   <b>备注</b>: ${item.remark}`);
        texts.push(`   <b>时间</b>: ${createdAt}`);
        texts.push(''); // 添加空行分隔不同用户
      });
      this.bot.sendMessage(
        this.myChatId,
        texts.join('\n'),
        {
          parse_mode: 'HTML',
        },
      );
    } else {
      this.bot.sendMessage(this.myChatId, `❌ 获取黑名单列表失败: ${result.message}`);
    }
  }

  /**
   * 打印聊天消息
   */
  async hello(msg) {
    this.bot.sendMessage(
      msg.chat.id,
      `🤖 当前聊天窗口的ChatId，点击复制:  \n<code>${msg.chat.id}</code>`,
      {
        parse_mode: 'HTML',
      },
    );
  }

  /**
   * 处理命令消息
   * @param {Object} msg Telegram消息对象
   * @description 仅机器人管理员可执行 /ban 和 /unban 命令
   */
  async handleCommand(msg) {
    const command = msg.text.split(' ')[0].split('@')[0];
    if (msg.chat.id === this.myChatId) {
      switch (command) {
        case '/ban':
          await this.ban(msg);
          break;
        case '/unban':
          await this.unban(msg);
          break;
        case '/banlist':
          await this.banlist(msg);
          break;
        case '/stats':
          await this.handleUserStats(msg);
          break;
        case '/status':
          await this.handleSystemStatus(msg);
          break;
        case '/d':
        case '/del':
        case '/remove':
        case '/c':
        case '/cancel':
          await this.handleRemoveMessage(msg);
          break;
        case '/ping': {
          await this.bot.sendMessage(msg.chat.id, 'pong');
          break;
        }
        case '/dc': {
          await this.dcPing(msg);
          break;
        }
        default:
          break;
      }
    }
    if (!this.myChatId && command === '/hello') {
      // 如果机器人没有设置 myChatId，通过/hello 获取 myChatId
      await this.hello(msg);
    }
  }

  /**
   * 检测Telegram数据中心延迟
   * @description 使用tg-dc-tcping模块检测Telegram数据中心延迟
   */
  dcPing(msg) {
    TGDCTcping().then((res) => {
      this.bot.sendMessage(msg?.chat?.id || this.myChatId, res.map((i, index) => {
        if (i === null) {
          return `DC${index + 1}: timeout`;
        }
        return `DC${index + 1}: ${i}ms`;
      }).join('\n'));
    }).catch((error) => {
      console.log(error);
      this.bot.sendMessage(this.myChatId, `tg dc ping error: ${error?.message}`);
    });
  }

  /**
   * 处理私聊消息
   * @param {Object} msg Telegram消息对象
   * @description 处理管理员和普通用户的私聊消息转发
   */
  async handlePrivateMessage(msg) {
    // 判断是否在黑名单中
    const blacklistResult = await this.blacklistService.checkFromMessage(msg);
    if (blacklistResult.success) {
      return;
    }

    if (msg.from.id === this.myChatId) {
      if (msg.reply_to_message) {
        await this.chatService.replyMessage(msg);
      }
    } else {
      await this.chatService.forwardMessage(msg);
    }
  }

  /**
   * 在群聊中回复私聊消息
   */
  async handleGroupMessage(msg) {
    if (msg.reply_to_message) {
      await this.chatService.replyMessage(msg);
    }
  }

  /**
   * 处理编辑消息
   */
  handleEditedMessage(msg) {
    const isMyChatId = msg.chat.id === this.myChatId;
    if (isMyChatId) {
      this.chatService.replyMessageEdit(msg);
    } else if (msg.chat.type === 'private') {
      this.chatService.forwardMessageEdit(msg);
    }
  }

  /**
   * 处理删除消息
   */
  async handleRemoveMessage(msg) {
    if (!msg.reply_to_message) {
      return;
    }
    await this.chatService.removeMessage(msg);
  }

  /**
   * 获取用户聊天统计信息
   */
  async handleUserStats(msg) {
    const info = await this.userService.stats(msg);
    this.bot.sendMessage(this.myChatId, info);
  }

  /**
   * 获取系统状态信息
   */
  async handleSystemStatus(msg) {
    try {
      if (this.processMonitor) {
        const statusReport = this.processMonitor.formatStatusReport();
        await this.bot.sendMessage(this.myChatId, statusReport, { parse_mode: 'HTML' });
      } else {
        // 如果没有进程监控器，显示基本信息
        const usage = process.memoryUsage();
        const uptime = process.uptime();

        const formatUptime = (seconds) => {
          const hours = Math.floor(seconds / 3600);
          const minutes = Math.floor((seconds % 3600) / 60);
          const secs = Math.floor(seconds % 60);
          return `${hours}h ${minutes}m ${secs}s`;
        };

        const basicStatus = `📊 系统状态
🕐 运行时间: ${formatUptime(uptime)}
💾 内存使用:
  • RSS: ${Math.round(usage.rss / 1024 / 1024)} MB
  • 堆内存: ${Math.round(usage.heapUsed / 1024 / 1024)} MB
  • 外部内存: ${Math.round(usage.external / 1024 / 1024)} MB
🖥️ 系统信息:
  • Node.js: ${process.version}
  • 平台: ${process.platform}
  • 进程ID: ${process.pid}`;

        await this.bot.sendMessage(this.myChatId, basicStatus);
      }
    } catch (error) {
      console.error('获取系统状态失败:', error);
      await this.bot.sendMessage(this.myChatId, '❌ 获取系统状态失败');
    }
  }

  /**
   * 错误处理包装器
   * @param {Function} handler 事件处理函数
   * @param {string} eventName 事件名称
   * @returns {Function} 包装后的处理函数
   */
  wrapWithErrorHandler(handler, eventName) {
    return async (...args) => {
      try {
        await handler.apply(this, args);
      } catch (error) {
        console.error(`${eventName} 处理失败:`, error);

        // 尝试通知管理员错误信息
        try {
          if (this.myChatId) {
            await this.bot.sendMessage(
              this.myChatId,
              `⚠️ 系统错误: ${eventName} 处理失败\n错误: ${error.message}\n时间: ${new Date().toISOString()}`,
            );
          }
        } catch (notifyError) {
          console.error('发送错误通知失败:', notifyError);
        }
      }
    };
  }

  /**
   * 初始化消息处理器
   * @description 注册消息事件监听，分发命令和私聊消息
   */
  start() {
    // 使用错误处理包装器包装所有事件处理器
    this.bot.on('message', this.wrapWithErrorHandler(this.handleMessage, 'message'));
    this.bot.on('edited_message', this.wrapWithErrorHandler(this.handleEditedMessage, 'edited_message'));

    // 添加全局错误处理
    this.bot.on('error', (error) => {
      console.error('Telegram Bot 错误:', error);
    });

    this.bot.on('polling_error', (error) => {
      console.error('Telegram Bot Polling 错误:', error);
    });

    if (process.env.HIDE_START_MESSAGE !== '1') {
      // 启动成功后通知管理员
      this.bot.sendMessage(
        this.myChatId,
        `✨🤖✨🤖✨🤖✨\n ChatBot启动成功\n当前时间：${dayjs().format('YYYY-MM-DD HH:mm:ss')}`,
      ).catch((error) => {
        console.error('发送启动消息失败:', error);
      });
      this.dcPing();
    }
    // 自动清除消息历史
    this.chatService.autoClearMessageHistory();
  }

  /**
   * 统一的消息处理入口
   * @param {Object} msg Telegram消息对象
   */
  async handleMessage(msg) {
    if (msg.text && msg.text.startsWith('/')) {
      await this.handleCommand(msg);
      return;
    }

    if (msg.chat.type === 'private') {
      await this.handlePrivateMessage(msg);
    } else if (
      ['group', 'supergroup'].includes(msg.chat.type)
      && msg.chat.id === this.myChatId
      && msg.reply_to_message?.message_id
    ) {
      // 在群聊中回复私聊消息
      await this.handleGroupMessage(msg);
    }
  }

  /**
   * 清理资源
   */
  cleanup() {
    // 清理Bot事件监听器
    if (this.bot) {
      this.bot.removeAllListeners('message');
      this.bot.removeAllListeners('edited_message');
      this.bot.removeAllListeners('error');
      this.bot.removeAllListeners('polling_error');
    }

    // 停止消息历史清理定时器
    if (this.chatService) {
      this.chatService.stopAutoClearMessageHistory();
    }

    // 停止进程监控器
    if (this.processMonitor) {
      this.processMonitor.stop();
    }
  }
}

export default BotController;

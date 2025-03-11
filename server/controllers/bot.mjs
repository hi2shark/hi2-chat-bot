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
 */

import dayjs from 'dayjs';

import ChatService from '../services/chat.mjs';
import BlacklistService from '../services/blacklist.mjs';
import UserService from '../services/user.mjs';
import TGDCTcping from '../utils/dc-tcping.mjs';

class BotController {
  constructor(bot, myChatId) {
    this.bot = bot;
    this.myChatId = myChatId;

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
      `🤖 当前机器人ChatId: <code>${msg.chat.id}</code>`,
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
  handleCommand(msg) {
    const command = msg.text.split(' ')[0].split('@')[0];
    if (msg.chat.id === this.myChatId) {
      switch (command) {
        case '/ban':
          this.ban(msg);
          break;
        case '/unban':
          this.unban(msg);
          break;
        case '/banlist':
          this.banlist(msg);
          break;
        case '/stats':
          this.handleUserStats(msg);
          break;
        case '/d':
        case '/del':
        case '/remove':
        case '/c':
        case '/cancel':
          this.handleRemoveMessage(msg);
          break;
        case '/ping': {
          this.bot.sendMessage(msg.chat.id, 'pong');
          break;
        }
        case '/dc': {
          this.dcPing(msg);
          break;
        }
        default:
          break;
      }
    }
    if (!this.myChatId && command === '/hello') {
      // 如果机器人没有设置 myChatId，通过/hello 获取 myChatId
      this.hello(msg);
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
   * 初始化消息处理器
   * @description 注册消息事件监听，分发命令和私聊消息
   */
  start() {
    this.bot.on('message', (msg) => {
      if (msg.text && msg.text.startsWith('/')) {
        this.handleCommand(msg);
        return;
      }

      if (msg.chat.type === 'private') {
        this.handlePrivateMessage(msg);
      } else
      if (
        ['group', 'supergroup'].includes(msg.chat.type)
        && msg.chat.id === this.myChatId
        && msg.reply_to_message?.message_id
      ) {
        // 在群聊中回复私聊消息（皮套人分身？
        this.handleGroupMessage(msg);
      }
    });

    // 处理编辑消息
    this.bot.on('edited_message', (msg) => {
      this.handleEditedMessage(msg);
    });

    // 启动成功后通知管理员
    this.bot.sendMessage(
      this.myChatId,
      `✨🤖✨🤖✨🤖✨\n ChatBot启动成功\n当前时间：${dayjs().format('YYYY-MM-DD HH:mm:ss')}`,
    );
    this.dcPing();
    // 自动清除消息历史
    this.chatService.autoClearMessageHistory();
  }
}

export default BotController;

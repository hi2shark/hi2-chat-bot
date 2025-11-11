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

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import ChatService from '../services/chat.mjs';
import BlacklistService from '../services/blacklist.mjs';
import UserService from '../services/user.mjs';
import AuditService from '../services/audit.mjs';
import TGDCTcping from '../utils/dc-tcping.mjs';
import logger from '../utils/logger.mjs';

// 读取 package.json 版本号
const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = dirname(currentFilePath);
const packageJson = JSON.parse(readFileSync(join(currentDirPath, '../../package.json'), 'utf-8'));
const APP_VERSION = packageJson.version;

class BotController {
  constructor(bot, myChatId, processMonitor = null) {
    this.bot = bot;
    this.myChatId = myChatId;
    this.processMonitor = processMonitor;

    this.chatService = new ChatService(this.bot, this.myChatId);
    this.blacklistService = new BlacklistService();
    this.userService = new UserService();
    this.auditService = new AuditService();

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
   * 初始化用户审核状态
   * @param {Object} msg 消息对象
   */
  async initAudit(msg) {
    let userId;
    let nickname = '';

    if (msg.reply_to_message?.message_id) {
      // 通过回复消息获取用户ID
      const message = await this.chatService.queryMessageItem(msg.reply_to_message.message_id);
      userId = message?.fromChatId;
      nickname = message?.nickname || '';
    } else {
      // 通过指令参数获取用户ID
      const textData = msg.text.split(' ');
      const userIdStr = textData[1];
      if (!userIdStr) {
        this.bot.sendMessage(
          this.myChatId,
          '❌ 请回复要初始化审核的用户消息，或使用 <code>/initaudit {userId}</code>',
          { parse_mode: 'HTML' },
        );
        return;
      }
      userId = parseInt(userIdStr, 10);
    }

    if (!userId) {
      this.bot.sendMessage(this.myChatId, '❌ 无法获取用户ID');
      return;
    }

    if (userId === this.myChatId) {
      this.bot.sendMessage(this.myChatId, '❌ 不能初始化管理员的审核状态');
      return;
    }

    // 检查并自动解除黑名单
    const blacklistResult = await this.blacklistService.check(userId);
    let unbanMessage = '';
    if (blacklistResult.success) {
      const removeResult = await this.blacklistService.remove(userId);
      if (removeResult.success) {
        unbanMessage = '✅ 已自动解除黑名单\n';
      }
    }

    // 重置用户审核状态
    const result = await this.userService.resetAuditStatus(userId, nickname);

    if (result.success) {
      const userInfo = nickname ? ` (${nickname})` : '';
      this.bot.sendMessage(
        this.myChatId,
        `✅ 已重置用户 <code>${userId}</code>${userInfo} 的审核状态\n${unbanMessage}${result.message}\n下次发送消息时将重新触发AI审核`,
        { parse_mode: 'HTML' },
      );
    } else {
      this.bot.sendMessage(
        this.myChatId,
        `❌ 初始化审核状态失败: ${result.message}`,
      );
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
   * 显示帮助信息
   */
  async showHelp(msg) {
    const helpText = `📖 <b>机器人指令帮助</b>

<b>🔨 基础指令</b>
• <code>/ping</code> - 检测机器人是否在线
• <code>/dc</code> - 检测与Telegram服务器的连接延迟
• <code>/status</code> - 获取机器人系统状态
• <code>/hello</code> - 获取当前聊天的ChatId

<b>🚫 黑名单管理</b>
• <code>/ban</code> - 拉黑用户
  使用方式：
  - 回复用户消息后发送 <code>/ban</code>
  - 或直接发送 <code>/ban {userId} {备注}</code>

• <code>/unban</code> - 解除拉黑
  使用方式：
  - 回复用户消息后发送 <code>/unban</code>
  - 或直接发送 <code>/unban {userId}</code>

• <code>/banlist</code> - 查看黑名单列表

<b>🤖 AI审核管理</b>
• <code>/initaudit</code> - 初始化用户审核状态
  使用方式：
  - 回复用户消息后发送 <code>/initaudit</code>
  - 或直接发送 <code>/initaudit {userId}</code>
  说明：重置用户审核状态，下次发送消息时将重新触发AI审核

<b>📊 统计与信息</b>
• <code>/stats</code> - 获取用户聊天统计信息
  使用方式：对用户消息回复发送 <code>/stats</code>

• <code>/info</code> - 获取消息详细信息
  使用方式：对用户消息回复发送 <code>/info</code>
  显示：用户ID、昵称、消息数、黑名单状态、审核状态等

<b>🗑️ 消息管理</b>
• <code>/del</code> - 撤回消息
  使用方式：对需要撤回的回复发送 <code>/del</code>
  别名：<code>/d</code>、<code>/c</code>、<code>/cancel</code>、<code>/remove</code>

<b>💡 提示</b>
- 所有管理指令仅机器人所有者可用
- AI审核功能需在环境变量中启用
- 被拉黑的用户发送的消息不会被转发`;

    await this.bot.sendMessage(this.myChatId, helpText, { parse_mode: 'HTML' });
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
        case '/initaudit':
          await this.initAudit(msg);
          break;
        case '/stats':
          await this.handleUserStats(msg);
          break;
        case '/info':
          await this.handleMessageInfo(msg);
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
        case '/help': {
          await this.showHelp(msg);
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
      logger.log(error);
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
      // AI审核流程（仅对非管理员的普通用户）
      if (this.auditService.isEnabled()) {
        const userId = msg.from.id;
        const auditCount = this.auditService.getAuditCount();

        // 检查用户是否需要审核
        const needsAudit = await this.userService.needsAudit(userId, auditCount);

        if (needsAudit) {
          // 检查消息是否包含媒体内容
          const hasMedia = !!(
            msg.photo
            || msg.video
            || msg.document
            || msg.animation
            || msg.audio
            || msg.voice
            || msg.video_note
            || msg.sticker
          );

          // 如果包含媒体内容，拒绝转发并提示用户
          if (hasMedia) {
            try {
              await this.bot.sendMessage(
                userId,
                '⚠️ 为了安全，请先发送纯文本消息通过审核后，才能发送图片、视频等媒体内容。\n请重新发送一条文字消息。',
              );
            } catch (error) {
              logger.error('发送提示消息失败:', error);
            }
            logger.log(`🚫 用户 ${userId} 首次发送媒体内容被拒绝，等待纯文本审核`);
            // 不转发消息，不增加审核计数，直接返回
            return;
          }

          // 获取消息文本内容
          const messageText = msg.text || msg.caption || '';

          // 如果有文本内容，进行AI审核
          if (messageText.trim().length > 0) {
            try {
              const auditResult = await this.auditService.checkAdvertisement(messageText);

              if (auditResult.isAdvertisement) {
                // 检测到广告，自动拉黑
                const nickname = msg.from.first_name || msg.from.username || '';
                const remark = `AI自动拉黑-广告 (${auditResult.reason})`;

                await this.blacklistService.add(userId, nickname, remark);

                logger.log(`🚫 AI检测到广告，已自动拉黑用户 ${userId} (${nickname})`);
                logger.log(`   原因: ${auditResult.reason}`);
                logger.log(`   内容: ${messageText.substring(0, 100)}...`);

                // 如果配置了通知用户，则发送通知消息
                if (this.auditService.shouldNotifyUser()) {
                  try {
                    await this.bot.sendMessage(
                      userId,
                      `⚠️ 您的消息因包含违规内容已被系统自动拦截，您已被加入黑名单。\n\n您的ID是<code>${userId}</code>`,
                      { parse_mode: 'HTML' },
                    );
                    logger.log(`📤 已通知用户 ${userId} 被AI自动拉黑`);
                  } catch (notifyError) {
                    logger.error(`发送拉黑通知失败: ${notifyError.message}`);
                  }
                }

                // 不转发消息，直接返回
                return;
              }

              // 未检测到广告，增加审核计数
              const models = (await import('../models/index.mjs')).default;
              const userModel = new models.User();

              // 确保用户记录存在
              let user = await userModel.findOne({ userId });
              if (!user) {
                // 如果用户不存在，先创建用户记录
                const nickname = msg.from.first_name || msg.from.username || '';
                await userModel.create({ userId, nickname });
                user = await userModel.findOne({ userId });
              }

              // 增加审核计数
              await userModel.incrementAuditedCount(userId);

              // 检查是否已完成所有审核
              const updatedUser = await userModel.findOne({ userId });
              if (updatedUser && updatedUser.auditedCount >= auditCount) {
                await userModel.setAuditPassed(userId, true);
                logger.log(`✅ 用户 ${userId} 已通过AI审核 (${updatedUser.auditedCount}/${auditCount})`);
              } else {
                logger.log(`📝 用户 ${userId} 审核进度: ${updatedUser?.auditedCount || 0}/${auditCount}`);
              }
            } catch (error) {
              logger.error('AI审核过程出错:', error);
              // 审核出错时继续转发消息，不阻塞流程
            }
          } else {
            // 没有文本内容的纯文本消息（空消息），拒绝并提示
            try {
              await this.bot.sendMessage(
                userId,
                '⚠️ 请发送有效的文字消息以通过审核。',
              );
            } catch (error) {
              logger.error('发送提示消息失败:', error);
            }
            logger.log(`🚫 用户 ${userId} 发送空消息被拒绝`);
            // 不转发消息，不增加审核计数，直接返回
            return;
          }
        }
      }

      // 转发消息
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
   * 获取消息详细信息
   * @description 读取回复消息的用户ID和消息ID
   */
  async handleMessageInfo(msg) {
    if (!msg.reply_to_message) {
      this.bot.sendMessage(this.myChatId, '⚠️ 请回复一条消息后使用此指令');
      return;
    }

    const replyMsg = msg.reply_to_message;
    const botMessageId = replyMsg.message_id;
    const botDate = replyMsg.date ? dayjs.unix(replyMsg.date).format('YYYY-MM-DD HH:mm:ss') : '未知';

    // 查询数据库中的消息记录，获取原始用户信息
    try {
      const message = await this.chatService.queryMessageItem(botMessageId);

      if (!message) {
        this.bot.sendMessage(
          this.myChatId,
          '❌ 未找到消息记录，这可能是您自己发送的消息或系统消息',
        );
        return;
      }

      // 从数据库获取原始用户信息
      const { fromChatId: originalUserId, originalMessageId } = message;

      // 查询用户表获取用户详细信息
      const models = (await import('../models/index.mjs')).default;
      const userModel = new models.User();
      const user = await userModel.findOne({ userId: originalUserId });

      const nickname = user?.nickname || '未知';

      // 检查是否在黑名单中
      const blacklistResult = await this.blacklistService.check(originalUserId);
      const blacklistStatus = blacklistResult.success
        ? `\n• <b>黑名单状态</b>: ⚫ 已拉黑\n• <b>拉黑原因</b>: ${blacklistResult.data?.remark || '无备注'}`
        : '\n• <b>黑名单状态</b>: ⚪ 正常';

      // 审核状态
      let auditStatus = '';
      if (this.auditService.isEnabled() && user) {
        const auditCount = this.auditService.getAuditCount();
        const auditedCount = user.auditedCount || 0;
        const isAuditPassed = user.isAuditPassed || false;
        auditStatus = `\n• <b>审核状态</b>: ${isAuditPassed ? '✅ 已通过' : `⏳ 进行中 (${auditedCount}/${auditCount})`}`;
      }

      // 统计信息
      const msgCount = user?.msgCount || 0;

      const infoText = `📋 <b>消息详细信息</b>

<b>👤 用户信息</b>
• <b>用户ID</b>: <code>${originalUserId}</code>
• <b>昵称</b>: ${nickname}
• <b>消息数</b>: ${msgCount}${blacklistStatus}${auditStatus}

<b>💬 消息信息</b>
• <b>原始消息ID</b>: <code>${originalMessageId}</code>
• <b>转发消息ID</b>: <code>${botMessageId}</code>
• <b>转发时间</b>: ${botDate}`;

      await this.bot.sendMessage(this.myChatId, infoText, { parse_mode: 'HTML' });
    } catch (error) {
      logger.error('获取消息详细信息失败:', error);
      this.bot.sendMessage(
        this.myChatId,
        `❌ 获取消息信息失败: ${error.message}`,
      );
    }
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
          const days = Math.floor(seconds / 86400);
          const hours = Math.floor((seconds % 86400) / 3600);
          const minutes = Math.floor((seconds % 3600) / 60);
          const secs = Math.floor(seconds % 60);

          if (days > 0) {
            return `${days}天 ${hours}小时 ${minutes}分 ${secs}秒`;
          }
          return `${hours}小时 ${minutes}分 ${secs}秒`;
        };

        const basicStatus = `📊 系统状态
🕐 运行时间: ${formatUptime(uptime)}
💾 内存使用:
  • RSS: ${Math.round(usage.rss / 1024 / 1024)} MB
  • 堆内存: ${Math.round(usage.heapUsed / 1024 / 1024)} MB
  • 外部内存: ${Math.round(usage.external / 1024 / 1024)} MB
🖥️ 系统信息:
  • 版本: v${APP_VERSION}
  • Node.js: ${process.version}
  • 平台: ${process.platform}
  • 进程ID: ${process.pid}`;

        await this.bot.sendMessage(this.myChatId, basicStatus);
      }
    } catch (error) {
      logger.error('获取系统状态失败:', error);
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
        logger.error(`${eventName} 处理失败:`, error);

        // 尝试通知管理员错误信息
        try {
          if (this.myChatId) {
            await this.bot.sendMessage(
              this.myChatId,
              `⚠️ 系统错误: ${eventName} 处理失败\n错误: ${error.message}\n时间: ${new Date().toISOString()}`,
            );
          }
        } catch (notifyError) {
          logger.error('发送错误通知失败:', notifyError);
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
      logger.error('Telegram Bot 错误:', error);
    });

    this.bot.on('polling_error', (error) => {
      logger.error('Telegram Bot Polling 错误:', error);
    });

    if (process.env.HIDE_START_MESSAGE !== '1') {
      // 启动成功后通知管理员
      this.bot.sendMessage(
        this.myChatId,
        `✨🤖✨🤖✨🤖✨\n ChatBot启动成功\n当前时间：${dayjs().format('YYYY-MM-DD HH:mm:ss')}`,
      ).catch((error) => {
        logger.error('发送启动消息失败:', error);
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

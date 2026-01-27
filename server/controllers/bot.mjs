/**
 * 私聊转发机器人
 *
 * - 指令
 *  - /hello 获取聊天ChatId
 *  - /ban 拉黑用户
 *  - /unban 解除拉黑用户
 *  - /banlist 查看黑名单列表
 *  - /bansearch 搜索黑名单
 *  - /initaudit 初始化用户审核状态
 *  - /test 测试AI审核功能
 *  - /del 删除消息 通用别名：/d、/remove、/c、/cancel
 *  - /ping 在线测试
 *  - /dc 测试Telegram数据中心延迟
 *  - /stats 获取用户聊天统计信息
 *  - /info 获取消息详细信息
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
import CaptchaService from '../services/captcha.mjs';
import TGDCTcping from '../utils/dc-tcping.mjs';
import logger from '../utils/logger.mjs';

// 读取 package.json 版本号
const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = dirname(currentFilePath);
const packageJson = JSON.parse(readFileSync(join(currentDirPath, '../../package.json'), 'utf-8'));
const APP_VERSION = packageJson.version;

const POLLING_RESTART_COOLDOWN_MS = 60000; // 60 秒内不重复重启
const POLLING_RESTART_DELAY_MS = 5000;

class BotController {
  constructor(bot, myChatId, processMonitor = null) {
    this.bot = bot;
    this.myChatId = myChatId;
    this.processMonitor = processMonitor;
    this.lastPollingRestartAt = 0;
    this.pollingRestartTimer = null;

    this.chatService = new ChatService(this.bot, this.myChatId);
    this.blacklistService = new BlacklistService();
    this.userService = new UserService();
    this.auditService = new AuditService();
    this.captchaService = new CaptchaService();

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
   * @param {number} page 页码（从1开始）
   * @param {number} messageId 要编辑的消息ID（用于翻页时更新消息）
   */
  async banlist(page = 1, messageId = null) {
    const result = await this.blacklistService.list();
    if (result.success) {
      if (result.data.length === 0) {
        const emptyMessage = '📋 <b>黑名单列表为空</b>';
        if (messageId) {
          await this.bot.editMessageText(emptyMessage, {
            chat_id: this.myChatId,
            message_id: messageId,
            parse_mode: 'HTML',
          });
        } else {
          this.bot.sendMessage(this.myChatId, emptyMessage, { parse_mode: 'HTML' });
        }
        return;
      }

      // 分页配置
      const pageSize = 5; // 每页显示5条
      const totalItems = result.data.length;
      const totalPages = Math.ceil(totalItems / pageSize);
      const currentPage = Math.max(1, Math.min(page, totalPages)); // 确保页码有效

      // 计算当前页的数据范围
      const startIndex = (currentPage - 1) * pageSize;
      const endIndex = Math.min(startIndex + pageSize, totalItems);
      const pageData = result.data.slice(startIndex, endIndex);

      // 构建消息文本
      const texts = [`📋 <b>黑名单列表</b> (第 ${currentPage}/${totalPages} 页)\n`];
      pageData.forEach((item, index) => {
        const globalIndex = startIndex + index + 1; // 全局索引
        const createdAt = dayjs(item.createdAt).format('YYYY-MM-DD HH:mm');
        texts.push(`${globalIndex}. <b>用户ID</b>: <code>${item.chatId}</code>`);
        if (item.nickname) texts.push(`   <b>昵称</b>: ${item.nickname}`);
        if (item.remark) texts.push(`   <b>备注</b>: ${item.remark}`);
        texts.push(`   <b>时间</b>: ${createdAt}`);
        texts.push(''); // 添加空行分隔不同用户
      });

      // 构建翻页按钮
      const keyboard = [];
      const buttonRow = [];

      if (totalPages > 1) {
        // 上一页按钮
        if (currentPage > 1) {
          buttonRow.push({
            text: '⬅️ 上一页',
            callback_data: `banlist:${currentPage - 1}`,
          });
        }

        // 页码显示
        buttonRow.push({
          text: `${currentPage}/${totalPages}`,
          callback_data: 'banlist:current',
        });

        // 下一页按钮
        if (currentPage < totalPages) {
          buttonRow.push({
            text: '下一页 ➡️',
            callback_data: `banlist:${currentPage + 1}`,
          });
        }

        keyboard.push(buttonRow);
      }

      // 添加刷新按钮
      keyboard.push([{
        text: '🔄 刷新',
        callback_data: `banlist:${currentPage}`,
      }]);

      const messageOptions = {
        parse_mode: 'HTML',
        reply_markup: keyboard.length > 0 ? { inline_keyboard: keyboard } : undefined,
      };

      // 发送或更新消息
      if (messageId) {
        await this.bot.editMessageText(texts.join('\n'), {
          chat_id: this.myChatId,
          message_id: messageId,
          ...messageOptions,
        });
      } else {
        await this.bot.sendMessage(this.myChatId, texts.join('\n'), messageOptions);
      }
    } else {
      const errorMessage = `❌ 获取黑名单列表失败: ${result.message}`;
      if (messageId) {
        await this.bot.editMessageText(errorMessage, {
          chat_id: this.myChatId,
          message_id: messageId,
        });
      } else {
        this.bot.sendMessage(this.myChatId, errorMessage);
      }
    }
  }

  /**
   * 搜索黑名单
   * @param {Object} msg 消息对象
   */
  async bansearch(msg) {
    const textData = msg.text.split(' ');
    const keyword = textData.slice(1).join(' ').trim();

    if (!keyword || keyword.length === 0) {
      this.bot.sendMessage(
        this.myChatId,
        '❌ 请提供搜索关键词\n\n使用方法：<code>/bansearch {关键词}</code>\n\n示例：\n• <code>/bansearch 123456789</code> - 搜索用户ID\n• <code>/bansearch 广告</code> - 搜索昵称或备注',
        { parse_mode: 'HTML' },
      );
      return;
    }

    // 发送搜索中提示
    const searchingMsg = await this.bot.sendMessage(this.myChatId, '🔍 正在搜索...');

    try {
      const result = await this.blacklistService.search(keyword);

      if (!result.success) {
        await this.bot.editMessageText(
          `❌ 搜索失败: ${result.message}`,
          {
            chat_id: this.myChatId,
            message_id: searchingMsg.message_id,
          },
        );
        return;
      }

      if (result.data.length === 0) {
        await this.bot.editMessageText(
          `🔍 <b>搜索结果</b>\n\n未找到包含关键词 "<code>${result.keyword}</code>" 的黑名单记录`,
          {
            chat_id: this.myChatId,
            message_id: searchingMsg.message_id,
            parse_mode: 'HTML',
          },
        );
        return;
      }

      // 构建搜索结果
      const texts = [`🔍 <b>搜索结果</b> (找到 ${result.data.length} 条记录)\n关键词: <code>${result.keyword}</code>\n`];
      result.data.forEach((item, index) => {
        const createdAt = dayjs(item.createdAt).format('YYYY-MM-DD HH:mm');
        texts.push(`${index + 1}. <b>用户ID</b>: <code>${item.chatId}</code>`);
        if (item.nickname) texts.push(`   <b>昵称</b>: ${item.nickname}`);
        if (item.remark) texts.push(`   <b>备注</b>: ${item.remark}`);
        texts.push(`   <b>时间</b>: ${createdAt}`);
        texts.push(''); // 添加空行分隔不同用户
      });

      await this.bot.editMessageText(
        texts.join('\n'),
        {
          chat_id: this.myChatId,
          message_id: searchingMsg.message_id,
          parse_mode: 'HTML',
        },
      );
    } catch (error) {
      logger.error('搜索黑名单失败:', error);
      await this.bot.editMessageText(
        `❌ 搜索失败: ${error.message}`,
        {
          chat_id: this.myChatId,
          message_id: searchingMsg.message_id,
        },
      );
    }
  }

  /**
   * 测试AI审核功能
   * @param {Object} msg 消息对象
   */
  async testAudit(msg) {
    // 检查AI审核是否启用
    if (!this.auditService.isEnabled()) {
      this.bot.sendMessage(
        this.myChatId,
        '❌ AI审核功能未启用\n请在环境变量中设置 AI_AUDIT_ENABLED=1 并配置 OPENAI_API_KEY',
      );
      return;
    }

    // 提取测试文本
    const textData = msg.text.split(' ');
    const testText = textData.slice(1).join(' ').trim();

    if (!testText || testText.length === 0) {
      this.bot.sendMessage(
        this.myChatId,
        '❌ 请提供要测试的文本\n\n使用方法：<code>/test {测试文本}</code>\n\n示例：\n• <code>/test 我是正常用户想咨询问题</code>\n• <code>/test 加微信xxx，专业代办各种证件</code>',
        { parse_mode: 'HTML' },
      );
      return;
    }

    // 发送处理中的提示
    const processingMsg = await this.bot.sendMessage(
      this.myChatId,
      '🤖 正在使用AI检测...',
    );

    try {
      // 调用AI审核
      const startTime = Date.now();
      const result = await this.auditService.checkAdvertisement(testText);
      const elapsedTime = Date.now() - startTime;

      // 构建结果消息
      const statusIcon = result.isAdvertisement ? '🚫' : '✅';
      const statusText = result.isAdvertisement ? '<b>检测到广告/违规内容</b>' : '<b>正常内容</b>';
      const actionText = result.isAdvertisement
        ? '\n\n⚠️ <b>处理动作</b>: 如果是新用户发送此类内容，将被自动拉黑'
        : '\n\n✅ <b>处理动作</b>: 内容正常，可以转发';

      const resultText = `${statusIcon} <b>AI审核测试结果</b>

<b>📝 测试文本</b>
<code>${testText.length > 200 ? `${testText.substring(0, 200)}...` : testText}</code>

<b>🎯 判定结果</b>
${statusText}

<b>💭 判定理由</b>
${result.reason}${actionText}

<b>⏱️ 耗时</b>: ${elapsedTime}ms
<b>🤖 模型</b>: ${this.auditService.model}`;

      // 更新消息显示结果
      await this.bot.editMessageText(resultText, {
        chat_id: this.myChatId,
        message_id: processingMsg.message_id,
        parse_mode: 'HTML',
      });

      logger.log(`🧪 AI审核测试: ${result.isAdvertisement ? '广告' : '正常'} | 耗时: ${elapsedTime}ms`);
    } catch (error) {
      logger.error('AI审核测试失败:', error);

      // 更新消息显示错误
      await this.bot.editMessageText(
        `❌ <b>AI审核测试失败</b>\n\n<b>错误信息</b>: ${error.message}\n\n请检查：\n• OpenAI API配置是否正确\n• API Key是否有效\n• 网络连接是否正常`,
        {
          chat_id: this.myChatId,
          message_id: processingMsg.message_id,
          parse_mode: 'HTML',
        },
      );
    }
  }

  /**
   * 测试验证码功能
   * @param {Object} msg 消息对象
   */
  async testCaptcha(msg) {
    // 检查验证码功能是否启用
    if (!this.captchaService.isEnabled()) {
      this.bot.sendMessage(
        this.myChatId,
        '❌ 人机验证功能未启用\n请在环境变量中设置 CAPTCHA_ENABLED=1',
      );
      return;
    }

    // 发送处理中的提示
    const processingMsg = await this.bot.sendMessage(
      this.myChatId,
      '🔐 正在生成测试验证码...',
    );

    try {
      // 生成测试验证码（使用管理员ID + 时间戳避免冲突）
      const testUserId = `test_${this.myChatId}_${Date.now()}`;
      const startTime = Date.now();
      const captchaData = await this.captchaService.createCaptcha(testUserId);
      const elapsedTime = Date.now() - startTime;

      const typeText = captchaData.type === 'text' ? '字符验证码' : '算术题验证码';

      // 删除提示消息
      await this.bot.deleteMessage(this.myChatId, processingMsg.message_id);

      // 发送验证码图片
      await this.bot.sendPhoto(
        this.myChatId,
        captchaData.image,
        {
          caption: `✅ <b>验证码测试</b>

<b>📋 验证码类型</b>: ${typeText}
<b>⏱️ 生成耗时</b>: ${elapsedTime}ms
<b>⏰ 有效期</b>: ${this.captchaService.timeout}秒
<b>🔄 最大重试次数</b>: ${this.captchaService.getMaxRetries()}次
<b>❌ 失败动作</b>: ${this.captchaService.getFailAction() === 'ban' ? '拉黑用户' : '仅禁止发消息'}

<i>这是测试验证码，用于检查验证码生成功能是否正常</i>`,
          parse_mode: 'HTML',
        },
        {
          filename: 'captcha.png',
          contentType: 'image/png',
        },
      );

      // 清理测试验证码记录
      const models = (await import('../models/index.mjs')).default;
      const captchaModel = new models.Captcha();
      await captchaModel.deleteByUserId(testUserId);

      logger.log(`🧪 验证码测试: 类型=${typeText} | 耗时: ${elapsedTime}ms`);
    } catch (error) {
      logger.error('验证码测试失败:', error);

      // 更新消息显示错误
      await this.bot.editMessageText(
        `❌ <b>验证码测试失败</b>\n\n<b>错误信息</b>: ${error.message}\n\n请检查：\n• canvas 库是否正确安装\n• 系统环境是否支持图片生成`,
        {
          chat_id: this.myChatId,
          message_id: processingMsg.message_id,
          parse_mode: 'HTML',
        },
      );
    }
  }

  /**
   * 初始化用户状态（重置审核和验证码）
   * @param {Object} msg 消息对象
   */
  async initUser(msg) {
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
          '❌ 请回复要初始化的用户消息，或使用 <code>/init {userId}</code>',
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
      this.bot.sendMessage(this.myChatId, '❌ 不能初始化管理员的状态');
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

    // 删除现有的验证码记录
    const models = (await import('../models/index.mjs')).default;
    const captchaModel = new models.Captcha();
    await captchaModel.deleteByUserId(userId);

    // 重置用户验证码状态
    const captchaResult = await this.userService.resetCaptchaStatus(userId, nickname);

    // 重置用户审核状态
    const auditResult = await this.userService.resetAuditStatus(userId, nickname);

    const userInfo = nickname ? ` (${nickname})` : '';
    const statusMessages = [];

    if (this.captchaService.isEnabled()) {
      statusMessages.push(captchaResult.success ? '验证码状态已重置' : `验证码重置失败: ${captchaResult.message}`);
    }

    if (this.auditService.isEnabled()) {
      statusMessages.push(auditResult.success ? 'AI审核状态已重置' : `审核重置失败: ${auditResult.message}`);
    }

    if (statusMessages.length === 0) {
      statusMessages.push('状态已重置（当前未启用验证码和AI审核功能）');
    }

    const message = `✅ 已初始化用户 <code>${userId}</code>${userInfo}\n${unbanMessage}${statusMessages.join('\n')}\n\n下次发送消息时将重新触发验证流程`;

    this.bot.sendMessage(this.myChatId, message, { parse_mode: 'HTML' });
  }

  /**
   * 重新生成验证码
   * @param {Object} msg 消息对象
   */
  async newCaptcha(msg) {
    const userId = msg.from.id;

    // 只允许普通用户使用此命令
    if (userId === this.myChatId) {
      return;
    }

    // 检查是否在黑名单中
    const blacklistResult = await this.blacklistService.check(userId);
    if (blacklistResult.success) {
      logger.log(`🚫 黑名单用户 ${userId} 尝试刷新验证码`);
      return;
    }

    // 检查是否启用验证码功能
    if (!this.captchaService.isEnabled()) {
      return;
    }

    // 检查用户是否需要验证
    const needsCaptcha = await this.userService.needsCaptcha(userId);
    if (!needsCaptcha) {
      try {
        await this.bot.sendMessage(
          userId,
          '✅ 您已完成验证，无需重新获取验证码。',
        );
      } catch (error) {
        logger.error('发送消息失败:', error);
      }
      return;
    }

    // 检查刷新频率限制
    try {
      const models = (await import('../models/index.mjs')).default;
      const captchaModel = new models.Captcha();
      const existingCaptcha = await captchaModel.getValidCaptcha(userId);

      if (existingCaptcha) {
        const refreshCount = existingCaptcha.refreshCount || 0;
        const lastRefreshAt = existingCaptcha.lastRefreshAt || existingCaptcha.createdAt;
        const timeSinceLastRefresh = (Date.now() - new Date(lastRefreshAt).getTime()) / 1000;

        // 第二次及以后的刷新需要等待10秒
        if (refreshCount > 0 && timeSinceLastRefresh < 10) {
          const waitTime = Math.ceil(10 - timeSinceLastRefresh);
          try {
            await this.bot.sendMessage(
              userId,
              `⏰ 请等待 ${waitTime} 秒后再重新获取验证码。\n\n剩余刷新次数: ${Math.max(0, 9 - refreshCount)}`,
            );
          } catch (error) {
            logger.error('发送等待提示失败:', error);
          }
          return;
        }

        // 增加刷新次数
        await captchaModel.incrementRefreshCount(userId);

        // 检查增加后是否达到拉黑阈值（连续刷新10次）
        const updatedCaptcha = await captchaModel.getValidCaptcha(userId);
        const newRefreshCount = updatedCaptcha?.refreshCount || 0;

        if (newRefreshCount >= 10) {
          const nickname = msg.from.first_name || msg.from.username || '';
          const remark = '验证码刷新次数过多（疑似机器人）';
          await this.blacklistService.add(userId, nickname, remark);
          await captchaModel.deleteByUserId(userId);

          try {
            await this.bot.sendMessage(
              userId,
              `❌ 您因频繁刷新验证码已被拉黑。\n\n您的ID是<code>${userId}</code>`,
              { parse_mode: 'HTML' },
            );
          } catch (error) {
            logger.error('发送拉黑通知失败:', error);
          }

          logger.log(`🚫 用户 ${userId} 因频繁刷新验证码被拉黑 (刷新${newRefreshCount}次)`);
          return;
        }
      }
    } catch (error) {
      logger.error('检查刷新频率失败:', error);
    }

    // 生成并发送新验证码
    try {
      const captchaData = await this.captchaService.createCaptcha(userId, true);
      const typeText = captchaData.type === 'text' ? '字符验证码' : '算术题';

      await this.bot.sendPhoto(
        userId,
        captchaData.image,
        {
          caption: `🔐 请完成人机验证\n\n请输入图片中的${typeText}答案\n验证码有效期: ${this.captchaService.timeout}秒\n\n如需重新获取验证码，请发送 /newcaptcha`,
        },
        {
          filename: 'captcha.png',
          contentType: 'image/png',
        },
      );

      logger.log(`🔄 用户 ${userId} 重新获取验证码`);
    } catch (error) {
      logger.error('发送验证码失败:', error);
      try {
        await this.bot.sendMessage(
          userId,
          '❌ 生成验证码失败，请稍后重试。',
        );
      } catch (sendError) {
        logger.error('发送错误消息失败:', sendError);
      }
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

• <code>/banlist</code> - 查看黑名单列表（支持翻页）

• <code>/bansearch</code> - 搜索黑名单
  使用方式：<code>/bansearch {关键词}</code>
  说明：根据用户ID、昵称或备注搜索黑名单记录

<b>🔐 用户状态管理</b>
• <code>/init</code> - 初始化用户状态
  使用方式：
  - 回复用户消息后发送 <code>/init</code>
  - 或直接发送 <code>/init {userId}</code>
  说明：重置用户的验证码和AI审核状态，同时自动解除黑名单

• <code>/newcaptcha</code> - 重新获取验证码
  说明：用户在验证过程中可使用此指令重新生成验证码

• <code>/test</code> - 测试AI审核功能
  使用方式：<code>/test {测试文本}</code>
  说明：验证大模型对特定文本的判定结果，检查AI审核是否正常工作

• <code>/testcaptcha</code> - 测试验证码功能
  说明：生成测试验证码图片，检查验证码生成功能是否正常

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
- 人机验证和AI审核功能需在环境变量中启用
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
          await this.banlist();
          break;
        case '/bansearch':
          await this.bansearch(msg);
          break;
        case '/init':
          await this.initUser(msg);
          break;
        case '/test':
        case '/testaudit':
          await this.testAudit(msg);
          break;
        case '/testcaptcha':
          await this.testCaptcha(msg);
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
      const userId = msg.from.id;

      // 优先处理待验证的验证码（如果存在）
      if (this.captchaService.isEnabled()) {
        const models = (await import('../models/index.mjs')).default;
        const captchaModel = new models.Captcha();
        const existingCaptcha = await captchaModel.getValidCaptcha(userId);

        // 如果有待验证的验证码，优先处理验证流程
        if (existingCaptcha) {
          // 用户已经有验证码，验证用户输入
          const userInput = msg.text || '';

          if (userInput.trim().length === 0) {
            // 用户发送的不是文本消息，提示需要回复验证码
            try {
              await this.bot.sendMessage(
                userId,
                '⚠️ 请回复验证码以完成验证。如需重新获取验证码，请发送 /newcaptcha',
              );
            } catch (error) {
              logger.error('发送提示消息失败:', error);
            }
            return;
          }

          // 验证验证码
          const verifyResult = await this.captchaService.verifyCaptcha(userId, userInput);

          if (verifyResult.success) {
            // 验证成功，设置用户验证通过状态
            await this.userService.setCaptchaPassed(userId);

            try {
              await this.bot.sendMessage(
                userId,
                '✅ 验证成功！',
              );
            } catch (error) {
              logger.error('发送验证成功消息失败:', error);
            }

            // 转发触发验证的原始消息
            if (existingCaptcha.triggerMessage) {
              try {
                logger.log(`📤 转发用户 ${userId} 验证前的消息`);
                // 使用存储的消息信息转发
                await this.chatService.forwardMessage(existingCaptcha.triggerMessage);
              } catch (error) {
                logger.error('转发触发消息失败:', error);
              }
            }

            // 不转发这条验证码消息，直接返回
            return;
          }

          // 验证失败
          if (verifyResult.shouldBan) {
            // 需要拉黑用户
            const nickname = msg.from.first_name || msg.from.username || '';
            const remark = '验证码验证失败次数过多';
            await this.blacklistService.add(userId, nickname, remark);

            try {
              await this.bot.sendMessage(
                userId,
                `❌ ${verifyResult.message}\n\n您的ID是<code>${userId}</code>`,
                { parse_mode: 'HTML' },
              );
            } catch (error) {
              logger.error('发送拉黑通知失败:', error);
            }

            logger.log(`🚫 用户 ${userId} 验证码验证失败次数过多，已拉黑`);
          } else {
            // 继续重试
            try {
              await this.bot.sendMessage(
                userId,
                `❌ ${verifyResult.message}\n\n如需重新获取验证码，请发送 /newcaptcha`,
              );
            } catch (error) {
              logger.error('发送验证失败消息失败:', error);
            }
          }

          return;
        }
      }

      // AI审核流程（仅对非管理员的普通用户）
      if (this.auditService.isEnabled()) {
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

              // 智能模式下，检测到无意义内容，触发人机验证
              if (auditResult.isMeaningless && this.auditService.isSmartModeEnabled()) {
                logger.log(`🤖 AI检测到无意义内容，触发人机验证: 用户 ${userId}`);
                logger.log(`   原因: ${auditResult.reason}`);
                logger.log(`   内容: ${messageText.substring(0, 100)}...`);

                // 生成验证码并发送给用户
                try {
                  const models = (await import('../models/index.mjs')).default;
                  const captchaModel = new models.Captcha();

                  // 生成验证码
                  const captchaData = await this.captchaService.createCaptcha(userId, false);
                  const typeText = captchaData.type === 'text' ? '字符验证码' : '算术题';

                  // 保存触发验证的消息
                  await captchaModel.saveTriggerMessage(userId, msg);

                  // 发送验证码图片给用户
                  await this.bot.sendPhoto(
                    userId,
                    captchaData.image,
                    {
                      caption: `🔐 请完成人机验证\n\n请输入图片中的${typeText}答案\n验证码有效期: ${this.captchaService.timeout}秒\n\n如需重新获取验证码，请发送 /newcaptcha`,
                    },
                    {
                      filename: 'captcha.png',
                      contentType: 'image/png',
                    },
                  );

                  logger.log(`📤 已向用户 ${userId} 发送验证码`);
                } catch (captchaError) {
                  logger.error(`生成或发送验证码失败: ${captchaError.message}`);
                  // 验证码生成失败，继续转发消息，不阻塞流程
                }

                // 不增加审核计数，不转发消息，直接返回
                return;
              }

              // 未检测到广告或无意义内容，增加审核计数
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

      // 普通人机验证流程（非智能模式，或未启用AI审核）
      if (this.captchaService.isEnabled() && !this.auditService.isSmartModeEnabled()) {
        const needsCaptcha = await this.userService.needsCaptcha(userId);

        if (needsCaptcha) {
          // 用户还没有验证码，生成并发送验证码
          try {
            const models = (await import('../models/index.mjs')).default;
            const captchaModel = new models.Captcha();

            const captchaData = await this.captchaService.createCaptcha(userId);
            const typeText = captchaData.type === 'text' ? '字符验证码' : '算术题';

            // 保存触发验证的消息
            await captchaModel.saveTriggerMessage(userId, msg);

            await this.bot.sendPhoto(
              userId,
              captchaData.image,
              {
                caption: `🔐 请完成人机验证\n\n请输入图片中的${typeText}答案\n验证码有效期: ${this.captchaService.timeout}秒\n\n如需重新获取验证码，请发送 /newcaptcha`,
              },
              {
                filename: 'captcha.png',
                contentType: 'image/png',
              },
            );

            logger.log(`📤 已向用户 ${userId} 发送验证码`);
          } catch (error) {
            logger.error('发送验证码失败:', error);
          }

          // 不转发这条消息，直接返回
          return;
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
   * 处理回调查询（用于翻页按钮等）
   * @param {Object} callbackQuery 回调查询对象
   */
  async handleCallbackQuery(callbackQuery) {
    const { data, message } = callbackQuery;
    const userId = callbackQuery.from.id;

    // 只允许机器人所有者使用
    if (userId !== this.myChatId) {
      await this.bot.answerCallbackQuery(callbackQuery.id, {
        text: '⚠️ 您没有权限执行此操作',
        show_alert: true,
      });
      return;
    }

    try {
      // 解析回调数据
      const [action, ...params] = data.split(':');

      switch (action) {
        case 'banlist': {
          // 解析页码
          let page = 1;
          if (params[0] === 'current') {
            // 从消息文本中提取当前页码
            const match = message?.text?.match(/第 (\d+)\//);
            page = match ? parseInt(match[1], 10) : 1;
          } else {
            // 从回调数据中获取页码
            page = parseInt(params[0], 10) || 1;
          }

          // 确保页码有效
          page = Math.max(1, page);

          // 如果点击的是当前页码按钮，不做任何操作
          if (params[0] === 'current') {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
              text: `当前是第 ${page} 页`,
            });
            return;
          }

          try {
            // 更新黑名单列表
            await this.banlist(page, message.message_id);

            // 回应回调查询
            await this.bot.answerCallbackQuery(callbackQuery.id, {
              text: `已切换到第 ${page} 页`,
            });
          } catch (error) {
            // 特殊处理 Telegram "消息未修改" 错误
            if (error.message && error.message.includes('message is not modified')) {
              await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '✅ 已经是最新数据',
              });
            } else {
              // 其他错误继续抛出
              throw error;
            }
          }
          break;
        }
        default:
          await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: '未知的操作',
          });
      }
    } catch (error) {
      logger.error('处理回调查询失败:', error);
      await this.bot.answerCallbackQuery(callbackQuery.id, {
        text: '❌ 操作失败，请重试',
        show_alert: true,
      });
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
   * polling_error 时自动重启轮询，带冷却避免短时间反复重启
   * @param {Error} error 轮询错误对象
   */
  handlePollingError(error) {
    const now = Date.now();
    if (now - this.lastPollingRestartAt < POLLING_RESTART_COOLDOWN_MS) {
      logger.warn('Polling 重启冷却中，跳过本次重启');
      return;
    }

    if (this.pollingRestartTimer) {
      return;
    }

    logger.log(`Polling 错误触发重启，将在 ${POLLING_RESTART_DELAY_MS / 1000} 秒后执行`);
    this.bot.stopPolling().catch(() => {});

    this.pollingRestartTimer = setTimeout(() => {
      this.pollingRestartTimer = null;
      this.bot.startPolling({ restart: true }).catch((err) => {
        logger.error('startPolling 失败:', err);
      });
      this.lastPollingRestartAt = Date.now();
      logger.log('Polling 已因错误触发重启');
      if (this.myChatId) {
        this.bot.sendMessage(
          this.myChatId,
          `⚠️ Telegram Polling 错误已触发自动重启\n错误: ${error?.message || String(error)}\n时间: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`,
        ).catch(logger.error);
      }
    }, POLLING_RESTART_DELAY_MS);
  }

  /**
   * 初始化消息处理器
   * @description 注册消息事件监听，分发命令和私聊消息
   */
  start() {
    // 使用错误处理包装器包装所有事件处理器
    this.bot.on('message', this.wrapWithErrorHandler(this.handleMessage, 'message'));
    this.bot.on('edited_message', this.wrapWithErrorHandler(this.handleEditedMessage, 'edited_message'));
    this.bot.on('callback_query', this.wrapWithErrorHandler(this.handleCallbackQuery, 'callback_query'));

    // 添加全局错误处理
    this.bot.on('error', (error) => {
      logger.error('Telegram Bot 错误:', error);
    });

    this.bot.on('polling_error', (error) => {
      logger.error('Telegram Bot Polling 错误:', error);
      this.handlePollingError(error);
    });

    if (process.env.HIDE_START_MESSAGE !== '1') {
      // 启动成功后通知管理员
      const features = [];
      if (this.auditService.enabled) {
        features.push('🤖 <b>AI审核</b>: ✅ 已启用');
      }
      if (this.captchaService.enabled) {
        features.push('🔐 <b>人机验证</b>: ✅ 已启用');
      }

      const featuresText = features.length > 0 ? `\n${features.join('\n')}` : '';

      this.bot.sendMessage(
        this.myChatId,
        `✨🤖✨🤖✨🤖✨
<b>ChatBot启动成功</b>
⏰ <b>启动时间</b>: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}${featuresText}`,
        { parse_mode: 'HTML' },
      ).catch((error) => {
        logger.error('发送启动消息失败:', error);
      });

      // 根据环境变量决定是否执行 dcPing
      if (process.env.ENABLE_DC_PING === '1') {
        this.dcPing();
      }
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
      const command = msg.text.split(' ')[0].split('@')[0];

      // /newcaptcha 指令可以被普通用户使用
      if (command === '/newcaptcha' && msg.chat.type === 'private') {
        await this.newCaptcha(msg);
        return;
      }

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
    if (this.pollingRestartTimer) {
      clearTimeout(this.pollingRestartTimer);
      this.pollingRestartTimer = null;
    }
    // 清理Bot事件监听器
    if (this.bot) {
      this.bot.removeAllListeners('message');
      this.bot.removeAllListeners('edited_message');
      this.bot.removeAllListeners('callback_query');
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

/**
 * 聊天消息处理方法
 */

import models from '../models/index.mjs';
import UserService from './user.mjs';

class ChatService {
  constructor(bot, myChatId) {
    this.bot = bot;
    this.myChatId = myChatId;
    this.clearHistoryTimer = null; // 添加定时器管理
  }

  /**
   * 根据消息ID查询chatId
   * @param {number} msgId 消息ID
   * @param {string} type 消息类型
   * @returns {Promise<number>} chatId
   */
  async queryChatId(msgId, type = 'forward') {
    const messageModel = new models.Message();
    const message = await messageModel.findOne({
      messageId: msgId,
      type,
    });
    if (!message) return null;
    return type === 'forward' ? message.fromChatId : message.replyChatId;
  }

  /**
   * 根据消息ID查询消息
   * @param {number} msgId 消息ID
   * @param {string} type 消息类型
   * @returns {Promise<Object>} 消息对象
   */
  async queryMessageItem(msgId, type = 'forward') {
    const messageModel = new models.Message();
    const message = await messageModel.findOne({
      messageId: msgId,
      type,
    });
    return message || null;
  }

  /**
   * 根据原始消息ID查询消息
   * @param {number} msgId 消息ID
   * @param {string} type 消息类型
   * @returns {Promise<Object>} 消息对象
   */
  async queryFirstMessageItemByOriginalMessageId(msgId, type = 'forward') {
    const messageModel = new models.Message();
    const message = await messageModel.list({
      originalMessageId: msgId,
      type,
    }, {
      sort: { createdAt: -1 },
    });
    return message?.[0] || null;
  }

  /**
   * 处理消息类型
   * @param {Object} message 消息对象
   * @returns {Object} 消息类型
   */
  handleMessageType(message) {
    const type = { text: 0, media: 0, caption: 0 };
    const {
      text, photo, video, audio, document, caption,
    } = message;

    if (text) type.text = 1;
    if (photo || video || audio || document) type.media = 1;
    if (caption) type.caption = 1;

    return type;
  }

  /**
   * 转发消息
   * @param {Object} message 消息对象
   */
  async forwardMessage(message) {
    const messageModel = new models.Message();
    const isForwardedMessage = message.forward_date;
    const userService = new UserService();

    await userService.updateUserFromMessage(message);

    if (isForwardedMessage) {
      this.bot.forwardMessage(
        this.myChatId,
        message.chat.id,
        message.message_id,
      ).then(async (res) => {
        await messageModel.add({
          type: 'forward',
          nickname: message.from.first_name || message.from.username || '',
          messageId: res.message_id,
          originalMessageId: message.message_id,
          fromChatId: message.chat.id,
          isNestedForward: true,
          forwardInfo: {
            fromUser: message.forward_origin ? message.forward_origin.sender_user_name : null,
            date: message.forward_date,
          },
          messageType: this.handleMessageType(message),
        });

        let sourceInfo = '';
        if (message.forward_origin?.type === 'channel') {
          sourceInfo = ` 从频道 "${message.forward_origin.chat?.title || '未知频道'}" 转发`;
        } else if (message.forward_sender_name) {
          sourceInfo = ' 转发自隐藏用户';
        } else if (message.forward_origin?.sender_user) {
          sourceInfo = ` 转发自 <code>${message.forward_origin.sender_user.first_name || '用户'}</code>(@${message.forward_origin.sender_user.username})`;
        }

        this.bot.sendMessage(
          this.myChatId,
          `👆 这是 <code>${message.from.first_name || message.from.username || '用户'}${message.from.username ? `</code> (@${message.from.username})` : ''}${sourceInfo} 的消息`,
          {
            reply_to_message_id: res.message_id,
            parse_mode: 'HTML',
          },
        );
      });
    } else {
      this.bot.forwardMessage(
        this.myChatId,
        message.chat.id,
        message.message_id,
      ).then(async (res) => {
        await messageModel.add({
          type: 'forward',
          nickname: message.from.first_name || message.from.username || '',
          messageId: res.message_id,
          originalMessageId: message.message_id,
          fromChatId: message.chat.id,
          messageType: this.handleMessageType(message),
        });
      });
    }
  }

  /**
   * 回复消息
   * @param {Object} message 消息对象
   */
  async replyMessage(message) {
    const { reply_to_message } = message;
    const replyToMessageId = reply_to_message?.message_id;

    if (!replyToMessageId) return;

    const messageModel = new models.Message();
    const replyMessage = await messageModel.queryByMessageId(replyToMessageId);

    if (!replyMessage) {
      this.bot.sendMessage(
        this.myChatId,
        '数据库无法匹配到消息，已无法回复该私聊消息',
        { reply_to_message_id: replyToMessageId },
      );
      return;
    }

    this.bot.copyMessage(
      replyMessage.fromChatId,
      message.chat.id,
      message.message_id,
    ).then(async (res) => {
      await messageModel.add({
        type: 'reply',
        nickname: message.from.first_name || message.from.username || '',
        messageId: res.message_id,
        originalMessageId: message.message_id,
        toChatId: message.chat.id,
        replyChatId: replyMessage.fromChatId,
        replyToMessageId,
        messageType: this.handleMessageType(message),
      });
    });
  }

  /**
   * 编辑消息
   * @param {Object} message 消息对象
   * @param {number} chatId 聊天ID
   * @param {number} messageId 消息ID
   * @param {boolean} showMessageUpdate 是否显示消息更新了
   * @param {string} type 编辑类型，copy或forward
   */
  async messageEdit(
    message,
    chatId,
    messageId,
    showMessageUpdate = false,
    type = 'copy',
  ) {
    if (message.text) {
      if (type === 'copy') {
        this.bot.editMessageText(
          message.text,
          {
            chat_id: chatId,
            message_id: messageId,
          },
        );
      } else {
        const messageModel = new models.Message();
        try {
          // 1. 记录旧消息的信息
          const oldMessage = await messageModel.findOne({ messageId });
          if (!oldMessage) return;

          // 2. 删除旧消息
          await this.bot.deleteMessage(chatId, messageId);

          try {
            // 3. 发送新消息并在成功后执行后续步骤
            const newMessage = await this.bot.sendMessage(
              chatId,
              message.text,
            );

            // 4. 消息发送成功后，记录新消息关系
            await messageModel.add({
              type: oldMessage.type,
              nickname: oldMessage.nickname,
              messageId: newMessage.message_id,
              originalMessageId: message.message_id,
              fromChatId: oldMessage.fromChatId,
              replyChatId: oldMessage.replyChatId,
              toChatId: oldMessage.toChatId,
              messageType: this.handleMessageType(message),
            });

            // 5. 删除旧消息记录
            await messageModel.remove({ messageId });

            if (showMessageUpdate) {
              this.bot.sendMessage(
                this.myChatId,
                '消息更新了',
                { reply_to_message_id: newMessage.message_id },
              );
            }
          } catch (sendError) {
            console.error('发送新消息失败:', sendError);
          }
        } catch (error) {
          console.error('消息编辑失败:', error);
        }
      }
      return;
    }

    // 转发媒体
    let inputMedia;
    // 图片
    if (message.photo) {
      inputMedia = {
        type: 'photo',
        media: message.photo[message.photo.length - 1].file_id,
      };
    } else if (message.video) {
      // 视频
      inputMedia = {
        type: 'video',
        media: message.video.file_id,
      };
    } else if (message.audio) {
      // 音频
      inputMedia = {
        type: 'audio',
        media: message.audio.file_id,
      };
    } else if (message.document) {
      // 文档
      inputMedia = {
        type: 'document',
        media: message.document.file_id,
      };
    } else if (message.animation) {
      // 动画
      inputMedia = {
        type: 'animation',
        media: message.animation.file_id,
      };
    }

    // 修改媒体消息 - 尝试使用替代方法
    if (inputMedia) {
      this.messageEditAlternative(message, chatId, messageId, showMessageUpdate);
    } else if (message.caption) {
      this.bot.editMessageCaption(
        message.caption,
        {
          chat_id: chatId,
          message_id: messageId,
        },
      );
    }
  }

  /**
   * 使用复制和删除实现媒体消息编辑
   * @param {Object} message 消息对象
   * @param {number} chatId 聊天ID
   * @param {number} messageId 要替换的消息ID
   * @param {boolean} showMessageUpdate 是否显示媒体更新了
   */
  async messageEditAlternative(message, chatId, messageId, showMessageUpdate) {
    const messageModel = new models.Message();

    try {
      // 1. 先复制新消息到目标聊天
      const newMessage = await this.bot.copyMessage(
        chatId,
        message.chat.id,
        message.message_id,
      );

      // 2. 删除原来的消息
      await this.bot.deleteMessage(chatId, messageId);

      // 3. 更新数据库中的消息记录
      const oldMessage = await messageModel.findOne({ messageId });
      if (oldMessage) {
        // 创建新消息记录
        await messageModel.add({
          type: oldMessage.type,
          nickname: oldMessage.nickname,
          messageId: newMessage.message_id,
          originalMessageId: message.message_id,
          fromChatId: oldMessage.fromChatId || message.chat.id,
          replyChatId: oldMessage.replyChatId,
          toChatId: oldMessage.toChatId,
          messageType: this.handleMessageType(message),
        });

        // 删除旧消息记录
        await messageModel.remove({ messageId });
      }

      if (showMessageUpdate) {
        this.bot.sendMessage(
          this.myChatId,
          '媒体消息更新了',
          { reply_to_message_id: newMessage.message_id },
        );
      }
    } catch (error) {
      console.error('媒体消息编辑失败:', error);
      // 如果失败，可以尝试使用原来的方法
      if (message.caption) {
        try {
          await this.bot.editMessageCaption(
            message.caption,
            {
              chat_id: chatId,
              message_id: messageId,
            },
          );
        } catch (captionError) {
          console.error('编辑消息标题也失败:', captionError);
        }
      }
    }
  }

  /**
   * 回复消息编辑
   * @param {Object} message 消息对象
   */
  async replyMessageEdit(message) {
    const { reply_to_message } = message;
    const replyToMessageId = reply_to_message?.message_id;

    if (!replyToMessageId) return;

    const messageModel = new models.Message();
    const replyMessage = await messageModel.queryByOriginalMessageId(message.message_id, 'reply');
    if (!replyMessage) return;

    // 判断消息没有操作48小时
    const now = new Date();
    const fourtyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    if (replyMessage.createdAt < fourtyEightHoursAgo) {
      this.bot.sendMessage(
        this.myChatId,
        '这条消息已经超过48小时，无法编辑',
        { reply_to_message_id: replyToMessageId },
      );
      return;
    }

    const newMessageType = this.handleMessageType(message);
    const oldMessageType = replyMessage.messageType;

    if (oldMessageType.text && !newMessageType.text) {
      this.bot.sendMessage(
        this.myChatId,
        '无法从文本消息转换为媒体消息！',
        { reply_to_message_id: replyToMessageId },
      );
      return;
    }

    if (oldMessageType.media && !newMessageType.media) {
      this.bot.sendMessage(
        this.myChatId,
        '无法从媒体消息转换为文本消息！',
      );
      return;
    }

    // 编辑消息
    this.messageEdit(message, replyMessage.replyChatId, replyMessage.messageId, false);
  }

  /**
   * 转发消息编辑
   * @param {Object} message 消息对象
   */
  async forwardMessageEdit(message) {
    // 判断是否允许编辑
    const isAllowedEdit = parseInt(process.env.ALLOW_EDIT, 10) === 1;

    // 转发消息不允许编辑？该死的tg设定
    if (!isAllowedEdit) {
      // 机器人告知用户不允许编辑，让他重新发送
      this.bot.sendMessage(
        message.chat.id,
        '抱歉，不允许编辑消息，请重新发送',
        { reply_to_message_id: message.message_id },
      );
      return;
    }

    // 通过原来消息的chatId，查询消息
    const beforeMessage = await this.queryFirstMessageItemByOriginalMessageId(message.message_id);
    if (!beforeMessage) return;

    // 判断消息没有操作48小时
    const now = new Date();
    const fourtyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    if (beforeMessage.createdAt < fourtyEightHoursAgo) {
      // 超过48小时，重新转发
      this.copyMessage(
        this.myChatId,
        message.chat.id,
        message.message_id,
        { reply_to_message_id: beforeMessage.messageId },
      );
      return;
    }

    const newMessageType = this.handleMessageType(message);
    const oldMessageType = beforeMessage.messageType;

    if ((oldMessageType.text && !newMessageType.text)
        || (oldMessageType.media && !newMessageType.media)) {
      this.bot.copyMessage(
        this.myChatId,
        message.chat.id,
        message.message_id,
        { reply_to_message_id: beforeMessage.messageId },
      );
      return;
    }

    // 编辑消息
    this.messageEdit(message, this.myChatId, beforeMessage.messageId, true, 'forward');
  }

  /**
   * 删除消息
   * @param {Object} message 消息对象
   */
  async removeMessage(message) {
    const { reply_to_message } = message;
    const replyToMessageId = reply_to_message?.message_id;

    if (!replyToMessageId) return;

    const messageModel = new models.Message();
    const replyMessage = await messageModel.queryByOriginalMessageId(replyToMessageId, 'reply');

    if (!replyMessage) {
      this.bot.sendMessage(
        this.myChatId,
        '数据库无法匹配到消息，已无法撤回该消息',
        { reply_to_message_id: replyToMessageId },
      );
      return;
    }

    // 判断消息是否超过48小时
    const now = new Date();
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    if (replyMessage.createdAt < fortyEightHoursAgo) {
      this.bot.sendMessage(
        this.myChatId,
        '这条消息已经超过48小时，无法撤回',
        { reply_to_message_id: replyToMessageId },
      );
      return;
    }

    this.bot.deleteMessage(replyMessage.replyChatId, replyMessage.messageId).then(() => {
      this.bot.sendMessage(this.myChatId, '这条消息撤回成功', {
        reply_to_message_id: replyToMessageId,
      });
      messageModel.remove({
        messageId: replyToMessageId,
      });
    });
  }

  /**
   * 清除消息历史
   * @param {number} hours 小时 默认720小时（30天）
   */
  async clearMessageHistory(hours = 720) {
    const messageModel = new models.Message();
    const now = new Date();
    const hoursAgo = new Date(now.getTime() - hours * 60 * 60 * 1000);
    await messageModel.remove({
      createdAt: { $lt: hoursAgo },
    });
  }

  /**
   * 自动清除消息历史
   */
  autoClearMessageHistory() {
    const autoClearHours = Number(process.env.MESSAGE_CLEAR_HOURS) || 720;
    if (autoClearHours !== -1) {
      // 如果已经存在定时器，先清理
      if (this.clearHistoryTimer) {
        clearInterval(this.clearHistoryTimer);
        this.clearHistoryTimer = null;
      }

      // 立即执行一次清理
      this.clearMessageHistory(autoClearHours);

      // 使用setInterval替代递归setTimeout
      this.clearHistoryTimer = setInterval(() => {
        this.clearMessageHistory(autoClearHours);
      }, 60 * 1000);
    }
  }

  /**
   * 停止自动清除消息历史
   */
  stopAutoClearMessageHistory() {
    if (this.clearHistoryTimer) {
      clearInterval(this.clearHistoryTimer);
      this.clearHistoryTimer = null;
    }
  }
}

export default ChatService;

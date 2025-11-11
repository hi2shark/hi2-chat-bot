/**
 * 用户服务
 */
import dayjs from 'dayjs';
import models from '../models/index.mjs';

class UserService {
  /**
   * 从消息中获取用户信息进行记录
   * @param {Object} message 消息对象
   */
  async updateUserFromMessage(message) {
    const { from } = message;
    const userModel = new models.User();
    const user = await userModel.findOne({ userId: from.id });
    if (!user) {
      await userModel.create({
        userId: from.id,
        nickname: from.first_name || from.username || '',
      });
    }
    // 增加消息计数
    await userModel.incrementMsgCount(from.id);
  }

  /**
   * 返回被回复消息的统计信息
   * @param {Object} message 消息对象
   * @returns {String}
   *  首次聊天：2025-03-10 12:00:00
   *  最近聊天：2025-03-10 12:00:00
   *  消息总数：100
   */
  async stats(message) {
    const replyMessageId = message.reply_to_message?.message_id;
    if (!replyMessageId) {
      return '请回复需要统计的用户消息';
    }
    const messageModel = new models.Message();
    const messageItem = await messageModel.findOne({
      messageId: replyMessageId,
      type: 'forward',
    });
    if (!messageItem) {
      return '没有找到该消息；\n请回复需要统计的用户消息，注意：机器人没有统计管理员的消息';
    }
    const userId = messageItem.fromChatId;
    const userModel = new models.User();
    const user = await userModel.findOne({ userId });
    if (!user) {
      return '没有保存该用户信息';
    }
    const formatDate = (date) => dayjs(date).format('YYYY-MM-DD HH:mm:ss');
    return `首次聊天：${formatDate(user.createdAt)}\n最近聊天：${formatDate(user.updatedAt)}\n消息总数：${user.msgCount}`;
  }

  /**
   * 重置用户审核状态
   * @param {number} userId 用户ID
   * @param {string} nickname 用户昵称（可选）
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async resetAuditStatus(userId, nickname = '') {
    try {
      const userModel = new models.User();
      const user = await userModel.findOne({ userId });

      if (!user) {
        // 如果用户不存在，创建一个新用户（初始状态就是待审核）
        await userModel.create({
          userId,
          nickname,
        });
        return {
          success: true,
          message: '用户不存在，已创建新用户记录并初始化审核状态',
        };
      }

      await userModel.resetAuditStatus(userId);

      return {
        success: true,
        message: '重置审核状态成功',
      };
    } catch (error) {
      console.error('重置审核状态失败:', error);
      return {
        success: false,
        message: `重置失败: ${error.message}`,
      };
    }
  }

  /**
   * 检查用户是否需要审核
   * @param {number} userId 用户ID
   * @param {number} auditCount 需要审核的次数
   * @returns {Promise<boolean>}
   */
  async needsAudit(userId, auditCount) {
    try {
      const userModel = new models.User();
      const user = await userModel.findOne({ userId });

      if (!user) {
        // 新用户需要审核
        return true;
      }

      // 如果已经通过审核，不需要再审核
      if (user.isAuditPassed) {
        return false;
      }

      // 如果审核次数未达到要求，需要审核
      return (user.auditedCount || 0) < auditCount;
    } catch (error) {
      console.error('检查审核状态失败:', error);
      return false;
    }
  }
}

export default UserService;

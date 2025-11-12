import Base from './base.mjs';

class Captcha extends Base {
  constructor() {
    super('captcha');
  }

  /**
   * 创建验证码记录
   * @param {Object} data 验证码数据
   * @returns {Promise<Object>} 创建结果
   */
  async create(data) {
    const addData = {
      createdAt: new Date(),
      retries: 0,
      refreshCount: 0,
      lastRefreshAt: new Date(),
      ...data, // data 放在后面，这样可以覆盖默认值
    };
    return super.create(addData);
  }

  /**
   * 增加重试次数
   * @param {string} userId 用户ID
   */
  async incrementRetries(userId) {
    return this.executeWithRetry(
      async (collection) => {
        const captcha = await collection.findOne({ userId });
        if (!captcha) {
          throw new Error('Captcha not found');
        }

        const safeWhere = this.handleWhere({ userId });
        return collection.updateOne(
          safeWhere,
          {
            $inc: { retries: 1 },
          },
        );
      },
      'increment captcha retries',
    );
  }

  /**
   * 获取用户当前有效的验证码
   * @param {string} userId 用户ID
   * @returns {Promise<Object|null>}
   */
  async getValidCaptcha(userId) {
    return this.executeWithRetry(
      async (collection) => {
        const now = new Date();
        return collection.findOne({
          userId,
          expiresAt: { $gt: now },
        });
      },
      'get valid captcha',
    );
  }

  /**
   * 删除用户的验证码记录
   * @param {string} userId 用户ID
   */
  async deleteByUserId(userId) {
    return this.executeWithRetry(
      async (collection) => {
        const safeWhere = this.handleWhere({ userId });
        return collection.deleteMany(safeWhere);
      },
      'delete captcha by userId',
    );
  }

  /**
   * 增加刷新次数
   * @param {string} userId 用户ID
   */
  async incrementRefreshCount(userId) {
    return this.executeWithRetry(
      async (collection) => {
        const captcha = await collection.findOne({ userId });
        if (!captcha) {
          throw new Error('Captcha not found');
        }

        const safeWhere = this.handleWhere({ userId });
        return collection.updateOne(
          safeWhere,
          {
            $inc: { refreshCount: 1 },
            $set: { lastRefreshAt: new Date() },
          },
        );
      },
      'increment refresh count',
    );
  }

  /**
   * 保存触发验证的消息
   * @param {string} userId 用户ID
   * @param {Object} message 消息对象
   */
  async saveTriggerMessage(userId, message) {
    return this.executeWithRetry(
      async (collection) => {
        const safeWhere = this.handleWhere({ userId });
        return collection.updateOne(
          safeWhere,
          {
            $set: { triggerMessage: message },
          },
        );
      },
      'save trigger message',
    );
  }

  /**
   * 清理过期的验证码记录
   */
  async cleanExpired() {
    return this.executeWithRetry(
      async (collection) => {
        const now = new Date();
        return collection.deleteMany({
          expiresAt: { $lt: now },
        });
      },
      'clean expired captchas',
    );
  }
}

export default Captcha;

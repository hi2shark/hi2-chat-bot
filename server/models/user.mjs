import Base from './base.mjs';

class User extends Base {
  constructor() {
    super('user');
  }

  /**
   * 创建用户
   * @param {Object} data 用户数据
   * @returns {Promise<Object>} 创建结果
   */
  async create(data) {
    const addData = {
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
      msgCount: 0,
      auditedCount: 0,
      isAuditPassed: false,
      isCaptchaPassed: false,
    };
    return super.create(addData);
  }

  /**
   * 更新用户
   * @param {Object} where 查询条件
   * @param {Object} data 更新数据
   * @returns {Promise<Object>} 更新结果
   */
  async update(where, data) {
    const updateData = {
      ...data,
      updatedAt: new Date(),
    };
    return super.update(where, updateData);
  }

  /**
   * 增加消息计数
   * @param {string} userId 用户ID
   */
  async incrementMsgCount(userId) {
    return this.executeWithRetry(
      async (collection) => {
        const user = await collection.findOne({ userId });
        if (!user) {
          throw new Error('User not found');
        }

        const safeWhere = this.handleWhere({ userId });
        return collection.updateOne(
          safeWhere,
          {
            $inc: { msgCount: 1 },
            $set: { updatedAt: new Date() },
          },
        );
      },
      'increment message count',
    );
  }

  /**
   * 增加审核计数
   * @param {string} userId 用户ID
   */
  async incrementAuditedCount(userId) {
    return this.executeWithRetry(
      async (collection) => {
        const user = await collection.findOne({ userId });
        if (!user) {
          throw new Error('User not found');
        }

        const safeWhere = this.handleWhere({ userId });
        return collection.updateOne(
          safeWhere,
          {
            $inc: { auditedCount: 1 },
            $set: { updatedAt: new Date() },
          },
        );
      },
      'increment audited count',
    );
  }

  /**
   * 设置审核通过状态
   * @param {string} userId 用户ID
   * @param {boolean} isPassed 是否通过
   */
  async setAuditPassed(userId, isPassed = true) {
    return this.executeWithRetry(
      async (collection) => {
        const safeWhere = this.handleWhere({ userId });
        return collection.updateOne(
          safeWhere,
          {
            $set: {
              isAuditPassed: isPassed,
              updatedAt: new Date(),
            },
          },
        );
      },
      'set audit passed status',
    );
  }

  /**
   * 重置用户审核状态
   * @param {string} userId 用户ID
   */
  async resetAuditStatus(userId) {
    return this.executeWithRetry(
      async (collection) => {
        const safeWhere = this.handleWhere({ userId });
        return collection.updateOne(
          safeWhere,
          {
            $set: {
              auditedCount: 0,
              isAuditPassed: false,
              updatedAt: new Date(),
            },
          },
        );
      },
      'reset audit status',
    );
  }

  /**
   * 设置验证码通过状态
   * @param {string} userId 用户ID
   * @param {boolean} isPassed 是否通过
   */
  async setCaptchaPassed(userId, isPassed = true) {
    return this.executeWithRetry(
      async (collection) => {
        const safeWhere = this.handleWhere({ userId });
        return collection.updateOne(
          safeWhere,
          {
            $set: {
              isCaptchaPassed: isPassed,
              updatedAt: new Date(),
            },
          },
        );
      },
      'set captcha passed status',
    );
  }

  /**
   * 重置用户验证码状态
   * @param {string} userId 用户ID
   */
  async resetCaptchaStatus(userId) {
    return this.executeWithRetry(
      async (collection) => {
        const safeWhere = this.handleWhere({ userId });
        return collection.updateOne(
          safeWhere,
          {
            $set: {
              isCaptchaPassed: false,
              updatedAt: new Date(),
            },
          },
        );
      },
      'reset captcha status',
    );
  }
}

export default User;

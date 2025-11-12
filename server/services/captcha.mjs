/**
 * 验证码服务
 * 生成验证码图片、验证用户输入
 */

import { createCanvas } from '@napi-rs/canvas';
import { Readable } from 'stream';
import models from '../models/index.mjs';
import logger from '../utils/logger.mjs';

class CaptchaService {
  constructor() {
    this.enabled = process.env.CAPTCHA_ENABLED === '1';
    this.maxRetries = parseInt(process.env.CAPTCHA_MAX_RETRIES || '3', 10);
    this.failAction = process.env.CAPTCHA_FAIL_ACTION || 'ban'; // ban 或 block
    this.timeout = parseInt(process.env.CAPTCHA_TIMEOUT || '180', 10); // 默认3分钟

    if (this.enabled) {
      logger.log(`✅ 人机验证服务已启用，最大重试次数: ${this.maxRetries}, 失败动作: ${this.failAction}, 有效期: ${this.timeout}秒`);
    }
  }

  /**
   * 检查是否启用验证码功能
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * 获取最大重试次数
   * @returns {number}
   */
  getMaxRetries() {
    return this.maxRetries;
  }

  /**
   * 获取失败后的动作
   * @returns {string}
   */
  getFailAction() {
    return this.failAction;
  }

  /**
   * 生成随机字符串验证码（数字+字母混合）
   * @param {number} length 验证码长度
   * @returns {string}
   */
  generateRandomCode(length = 4) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去除易混淆的字符 I,O,0,1
    let code = '';
    for (let i = 0; i < length; i += 1) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * 生成算术题验证码
   * @returns {{question: string, answer: string}}
   */
  generateMathCode() {
    const operators = ['+', '-', '×'];
    const operator = operators[Math.floor(Math.random() * operators.length)];

    let num1,
      num2,
      answer;

    switch (operator) {
      case '+':
        num1 = Math.floor(Math.random() * 20) + 1;
        num2 = Math.floor(Math.random() * 20) + 1;
        answer = num1 + num2;
        break;
      case '-':
        num1 = Math.floor(Math.random() * 20) + 10;
        num2 = Math.floor(Math.random() * num1);
        answer = num1 - num2;
        break;
      case '×':
        num1 = Math.floor(Math.random() * 10) + 1;
        num2 = Math.floor(Math.random() * 10) + 1;
        answer = num1 * num2;
        break;
      default:
        num1 = 1;
        num2 = 1;
        answer = 2;
    }

    return {
      question: `${num1} ${operator} ${num2} = ?`,
      answer: answer.toString(),
    };
  }

  /**
   * 生成验证码图片
   * @param {string} text 验证码文本
   * @param {string} type 验证码类型 (text 或 math)
   * @returns {Readable} 图片stream
   */
  generateCaptchaImage(text, type = 'text') {
    const width = 200;
    const height = 80;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 背景色
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, width, height);

    // 添加干扰线
    for (let i = 0; i < 5; i += 1) {
      ctx.strokeStyle = this.randomColor(150, 200);
      ctx.beginPath();
      ctx.moveTo(Math.random() * width, Math.random() * height);
      ctx.lineTo(Math.random() * width, Math.random() * height);
      ctx.stroke();
    }

    // 添加噪点
    for (let i = 0; i < 50; i += 1) {
      ctx.fillStyle = this.randomColor(0, 255);
      ctx.beginPath();
      ctx.arc(
        Math.random() * width,
        Math.random() * height,
        1,
        0,
        2 * Math.PI,
      );
      ctx.fill();
    }

    // 绘制验证码文本
    const fontSize = type === 'math' ? 24 : 32;
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textBaseline = 'middle';

    const chars = text.split('');
    const charWidth = width / (chars.length + 1);

    chars.forEach((char, index) => {
      ctx.fillStyle = this.randomColor(50, 100);
      ctx.save();

      const x = charWidth * (index + 0.8);
      const y = height / 2;

      // 随机旋转角度
      const angle = (Math.random() - 0.5) * 0.4;
      ctx.translate(x, y);
      ctx.rotate(angle);

      ctx.fillText(char, 0, 0);
      ctx.restore();
    });

    // 转为Stream以避免 deprecation warning
    const buffer = canvas.toBuffer('image/png');
    const stream = Readable.from(buffer);
    stream.path = 'captcha.png'; // 设置文件名
    return stream;
  }

  /**
   * 生成随机颜色
   * @param {number} min 最小值
   * @param {number} max 最大值
   * @returns {string} RGB颜色字符串
   */
  randomColor(min, max) {
    const r = Math.floor(Math.random() * (max - min) + min);
    const g = Math.floor(Math.random() * (max - min) + min);
    const b = Math.floor(Math.random() * (max - min) + min);
    return `rgb(${r},${g},${b})`;
  }

  /**
   * 为用户创建验证码
   * @param {number} userId 用户ID
   * @param {boolean} preserveRefreshCount 是否保留刷新次数
   * @returns {Promise<{image: Readable, type: string}>}
   */
  async createCaptcha(userId, preserveRefreshCount = false) {
    try {
      const captchaModel = new models.Captcha();

      // 保存之前的刷新次数
      let previousRefreshCount = 0;
      let previousLastRefreshAt = new Date();
      if (preserveRefreshCount) {
        const existing = await captchaModel.getValidCaptcha(userId);
        if (existing) {
          previousRefreshCount = existing.refreshCount || 0;
          previousLastRefreshAt = existing.lastRefreshAt || existing.createdAt;
        }
      }

      // 删除该用户之前的验证码记录
      await captchaModel.deleteByUserId(userId);

      // 随机选择验证码类型
      const type = Math.random() > 0.5 ? 'text' : 'math';
      let code,
        displayText;

      if (type === 'text') {
        code = this.generateRandomCode(4);
        displayText = code;
      } else {
        const mathData = this.generateMathCode();
        code = mathData.answer;
        displayText = mathData.question;
      }

      // 生成图片
      const image = this.generateCaptchaImage(displayText, type);

      // 保存到数据库
      const expiresAt = new Date(Date.now() + this.timeout * 1000);
      const captchaData = {
        userId,
        code,
        type,
        expiresAt,
        triggerMessage: null, // 稍后会更新
      };

      // 如果需要保留刷新次数，则添加到数据中
      if (preserveRefreshCount) {
        captchaData.refreshCount = previousRefreshCount;
        captchaData.lastRefreshAt = previousLastRefreshAt;
      }

      await captchaModel.create(captchaData);

      logger.log(`🔐 已为用户 ${userId} 生成验证码 (类型: ${type === 'text' ? '字符' : '算术'})`);

      return {
        image,
        type,
      };
    } catch (error) {
      logger.error('创建验证码失败:', error);
      throw error;
    }
  }

  /**
   * 验证用户输入的验证码
   * @param {number} userId 用户ID
   * @param {string} userInput 用户输入
   * @returns {Promise<{success: boolean, message: string, retries?: number, shouldBan?: boolean}>}
   */
  async verifyCaptcha(userId, userInput) {
    try {
      const captchaModel = new models.Captcha();

      // 获取有效的验证码
      const captcha = await captchaModel.getValidCaptcha(userId);

      if (!captcha) {
        return {
          success: false,
          message: '验证码已过期或不存在，请重新发送消息获取新验证码',
        };
      }

      // 验证答案（不区分大小写）
      const isCorrect = userInput.trim().toUpperCase() === captcha.code.toUpperCase();

      if (isCorrect) {
        // 验证成功，删除验证码记录
        await captchaModel.deleteByUserId(userId);
        logger.log(`✅ 用户 ${userId} 验证码验证成功`);

        return {
          success: true,
          message: '验证成功',
        };
      }

      // 验证失败，增加重试次数
      await captchaModel.incrementRetries(userId);
      const updatedCaptcha = await captchaModel.findOne({ userId });
      const retries = updatedCaptcha?.retries || 0;

      logger.log(`❌ 用户 ${userId} 验证码验证失败 (${retries}/${this.maxRetries})`);

      // 检查是否达到最大重试次数
      if (retries >= this.maxRetries) {
        await captchaModel.deleteByUserId(userId);
        const shouldBan = this.failAction === 'ban';

        return {
          success: false,
          message: shouldBan
            ? '验证失败次数过多，您已被拉黑'
            : '验证失败次数过多，请稍后重试',
          shouldBan,
          retries,
        };
      }

      return {
        success: false,
        message: `验证码错误，您还有 ${this.maxRetries - retries} 次机会`,
        retries,
      };
    } catch (error) {
      logger.error('验证验证码失败:', error);
      return {
        success: false,
        message: `验证失败: ${error.message}`,
      };
    }
  }

  /**
   * 清理过期的验证码记录
   */
  async cleanExpiredCaptchas() {
    try {
      const captchaModel = new models.Captcha();
      await captchaModel.cleanExpired();
    } catch (error) {
      logger.error('清理过期验证码失败:', error);
    }
  }
}

export default CaptchaService;

/* eslint-disable no-await-in-loop */
/**
 * 数据模型基类
 * 提供基础的数据库操作方法
 */

import {
  MongoClient,
  ObjectId,
} from 'mongodb';
import autoId from '../db/auto-id.mjs';

const {
  MONGODB_URL,
  MONGODB_NAME,
} = process.env;

// 数据库连接配置
const clientOptions = {
  maxPoolSize: 10, // 连接池最大连接数
  minPoolSize: 2,  // 连接池最小连接数
  maxIdleTimeMS: 30000, // 连接空闲超时时间
  serverSelectionTimeoutMS: 5000, // 服务器选择超时时间
  socketTimeoutMS: 45000, // Socket超时时间
  family: 4, // 使用IPv4
  retryWrites: true, // 启用重试写入
  retryReads: true, // 启用重试读取
};

// 创建单例连接
const client = new MongoClient(MONGODB_URL, clientOptions);
let dbConnection = null;
let isConnecting = false;

/**
 * 连接状态检查
 */
async function checkConnection() {
  try {
    if (!client.topology?.isConnected()) {
      return false;
    }
    // 通过ping检查连接健康状态
    await client.db('admin').command({ ping: 1 });
    return true;
  } catch (error) {
    console.error('数据库连接检查失败:', error.message);
    return false;
  }
}

/**
 * 重试连接机制
 */
async function connectWithRetry(retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i += 1) {
    try {
      await client.connect();
      console.log('数据库连接成功');
      return;
    } catch (error) {
      console.error(`数据库连接失败 (尝试 ${i + 1}/${retries}):`, error.message);
      if (i === retries - 1) {
        throw error;
      }
      // 等待后重试
      await new Promise((resolve) => setTimeout(resolve, delay * (2 ** i)));
    }
  }
}

class Base {
  /**
   * 构造函数
   * @param {string} collectionName 集合名称
   */
  constructor(collectionName) {
    this.collectionName = collectionName;
  }

  /**
   * 处理查询条件
   * @param {Object} where 查询条件
   * @returns {Object} 处理后的查询条件
   */
  handleWhere(where) {
    // 优化后的清理函数
    const sanitize = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;

      if (obj instanceof ObjectId) {
        return obj;
      }

      return Object.entries(obj).reduce((acc, [key, value]) => {
        // 递归处理嵌套对象
        if (Array.isArray(value)) {
          acc[key] = value.map(sanitize);
        } else if (typeof value === 'object' && value !== null) {
          acc[key] = sanitize(value);
        } else if (typeof value === 'string') {
          acc[key] = value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        } else {
          acc[key] = value;
        }
        return acc;
      }, {});
    };

    // 转换_id
    const handleId = (obj) => {
      if (obj._id && !(obj._id instanceof ObjectId)) {
        obj._id = autoId(obj._id);
      }
      return obj;
    };

    // 完整的处理流程
    try {
      return handleId(sanitize(where || {}));
    } catch (e) {
      console.error('查询条件处理失败:', e);
      return {};
    }
  }

  /**
   * 创建数据库连接
   * @returns {Promise<Object>} 返回数据库和集合对象
   */
  async connect() {
    // 避免并发连接
    if (isConnecting) {
      // 等待当前连接完成
      // eslint-disable-next-line no-unmodified-loop-condition
      while (isConnecting) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // 检查现有连接
    if (dbConnection) {
      const isHealthy = await checkConnection();
      if (isHealthy) {
        const collection = dbConnection.collection(this.collectionName);
        return { db: dbConnection, collection };
      }
      // 连接不健康，重置连接
      console.log('检测到数据库连接不健康，重新连接...');
      dbConnection = null;
    }

    // 建立新连接
    if (!dbConnection) {
      isConnecting = true;
      try {
        await connectWithRetry();
        dbConnection = client.db(MONGODB_NAME);
        console.log('数据库连接池已建立');
      } catch (error) {
        console.error('数据库连接失败:', error);
        throw new Error(`数据库连接失败: ${error.message}`);
      } finally {
        isConnecting = false;
      }
    }

    const collection = dbConnection.collection(this.collectionName);
    return { db: dbConnection, collection };
  }

  /**
   * 关闭数据库连接
   */
  static async closeConnection() {
    if (dbConnection || client.topology?.isConnected()) {
      try {
        console.log('正在关闭数据库连接...');
        await client.close();
        dbConnection = null;
        isConnecting = false;
        console.log('数据库连接已关闭');
      } catch (error) {
        console.error('关闭数据库连接时发生错误:', error);
        // 强制重置状态
        dbConnection = null;
        isConnecting = false;
      }
    }
  }

  /**
   * 创建文档
   * @param {Object} info 文档信息
   * @returns {Promise<Object>} 创建结果
   */
  async create(info) {
    return this.executeWithRetry(
      async (collection) => {
        const res = await collection.insertOne(info);
        return res;
      },
      'create document',
    );
  }

  /**
   * 删除文档
   * @param {Object} where 删除条件
   * @returns {Promise<Object>} 删除结果
   */
  async remove(where) {
    return this.executeWithRetry(
      async (collection) => {
        const safeWhere = this.handleWhere(where);
        return collection.deleteMany(safeWhere);
      },
      'remove documents',
    );
  }

  /**
   * 更新文档
   * @param {Object} where 查询条件
   * @param {Object} info 更新信息
   * @returns {Promise<Object>} 更新结果
   */
  async update(where, info) {
    return this.executeWithRetry(
      async (collection) => {
        const safeWhere = this.handleWhere(where);
        return collection.updateOne(safeWhere, { $set: info });
      },
      'update document',
    );
  }

  /**
   * 根据条件查询文档
   * @param {Object} where 查询条件
   * @returns {Promise<Array>} 查询结果
   */
  async find(
    where = {},
    sort = {},
  ) {
    const { collection } = await this.connect();
    const safeWhere = this.handleWhere(where);
    const query = collection.find(safeWhere);
    if (Object.keys(sort).length) {
      query.sort(sort);
    }
    return query.toArray();
  }

  /**
   * 根据条件查询单个文档
   * @param {Object} where 查询条件
   * @returns {Promise<Object|null>} 查询结果，未找到返回null
   */
  async findOne(where = {}) {
    return this.executeWithRetry(
      async (collection) => {
        const safeWhere = this.handleWhere(where);
        return collection.findOne(safeWhere);
      },
      'find one document',
    );
  }

  /**
   * 根据ID查询单个文档
   * @param {string} _id 文档ID
   * @returns {Promise<Object|null>} 查询结果，未找到返回null
   */
  async queryById(_id) {
    const { collection } = await this.connect();
    try {
      const safeWhere = this.handleWhere({
        _id,
      });
      const result = await collection.findOne(safeWhere);
      return result || null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  /**
   * 查询文档列表
   * @param {Object} where 查询条件
   * @param {number} page 页码
   * @param {number} size 每页数量
   * @param {Object} sort 排序参数 {field: 1|-1}
   * @returns {Promise<Array>} 文档列表
   */
  async list(
    where = {},
    page = 1,
    size = 10,
    sort = {},
  ) {
    const { collection } = await this.connect();
    let list = [];
    try {
      const safeWhere = this.handleWhere(where);
      const query = collection.find(safeWhere);
      if (Object.keys(sort).length) {
        query.sort(sort);
      }
      query.limit(size).skip((page - 1) * size);
      list = await query.toArray();
    } catch (error) {
      console.error(error);
      list = [];
    }
    return list;
  }

  /**
   * 获取所有列表
   * @param {Object} where 查询条件
   * @param {Object} sort 排序参数 {field: 1|-1}
   * @returns {Promise<Array>} 列表
   */
  async allList(where = {}, sort = {}) {
    const { collection } = await this.connect();
    try {
      const safeWhere = this.handleWhere(where);
      const query = collection.find(safeWhere);
      if (Object.keys(sort).length) {
        query.sort(sort);
      }
      return query.toArray();
    } catch (error) {
      console.error('获取所有列表失败:', error);
      return [];
    }
  }

  /**
   * 获取列表及总数量
   * @param {Object} where 查询条件
   * @param {number} page 页码
   * @param {number} size 每页数量
   * @param {Object} sort 排序参数 {field: 1|-1}
   * @returns {Promise<Object>} 列表及总数量
   */
  async listWithTotal(
    where = {},
    page = 1,
    size = 10,
    sort = {},
  ) {
    const { collection } = await this.connect();
    const safeWhere = this.handleWhere(where);

    const query = collection.find(safeWhere);
    if (Object.keys(sort).length) {
      query.sort(sort);
    }
    query.limit(size).skip((page - 1) * size);

    const list = await query.toArray();
    const total = await collection.countDocuments(safeWhere);

    return {
      list,
      total,
    };
  }

  /**
   * 根据条件查询并更新文档
   * @param {Object} filter 查询条件
   * @param {Object} update 更新信息
   * @param {Object} options 选项
   * @returns {Promise<Object>} 更新后的文档
   */
  async findOneAndUpdate(filter, update, options = {}) {
    const { collection } = await this.connect();
    const query = collection.findOneAndUpdate(
      filter,
      update,
      {
        returnDocument: 'after',
        ...options,
      },
    );
    return query.then((result) => result.value);
  }

  /**
   * 统计文档数量
   * @param {Object} where 查询条件
   * @returns {Promise<number>} 文档数量
   */
  async count(where = {}) {
    const { collection } = await this.connect();
    const safeWhere = this.handleWhere(where);
    return collection.countDocuments(safeWhere);
  }

  /**
   * 执行数据库操作的通用包装器
   * @param {Function} operation 要执行的数据库操作
   * @param {string} operationName 操作名称，用于日志
   * @returns {Promise<any>} 操作结果
   */
  async executeWithRetry(operation, operationName = 'database operation') {
    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        const { collection } = await this.connect();
        return operation(collection);
      } catch (error) {
        lastError = error;
        console.error(`${operationName} 失败 (尝试 ${attempt}/${maxRetries}):`, error.message);

        // 对于连接相关的错误，重置连接
        if (error.name === 'MongoServerSelectionError'
            || error.name === 'MongoNetworkTimeoutError'
            || error.name === 'MongoTimeoutError') {
          dbConnection = null;
          isConnecting = false;

          if (attempt < maxRetries) {
            const delay = (2 ** (attempt - 1)) * 1000; // 指数退避
            await new Promise((resolve) => setTimeout(resolve, delay));
            // eslint-disable-next-line no-continue
            continue;
          }
        }

        // 对于其他错误，不重试
        break;
      }
    }

    throw new Error(`${operationName} 在 ${maxRetries} 次尝试后失败: ${lastError.message}`);
  }
}

export default Base;

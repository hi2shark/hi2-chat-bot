import { MongoClient } from 'mongodb';

const {
  MONGODB_URL,
  MONGODB_NAME,
} = process.env;

const dbNames = [
  'message',
  'blacklist',
];

/**
 * 检查并创建集合
 */
async function createCollections(db) {
  const checkAndCreateCollection = async (name) => {
    const collections = await db.listCollections({ name }).toArray();

    if (collections.length === 0) {
      await db.createCollection(name);
      console.log(`集合 ${name} 已创建`);
    } else {
      console.log(`集合 ${name} 已存在`);
    }
  };

  await Promise.all(dbNames.map(checkAndCreateCollection));
}

/**
 * 检查并创建数据库
 */
async function initDatabase() {
  const client = new MongoClient(MONGODB_URL);
  try {
    await client.connect();

    // 获取所有数据库列表
    const adminDb = client.db('admin');
    const dbs = await adminDb.admin().listDatabases();
    const dbExists = dbs.databases.some((db) => db.name === MONGODB_NAME);

    if (!dbExists) {
      console.log(`创建数据库: ${MONGODB_NAME}`);
      client.db(MONGODB_NAME);
    }

    const db = client.db(MONGODB_NAME);
    await createCollections(db);

    console.log('数据库初始化完成');
  } catch (error) {
    console.error('数据库初始化失败:', error);
    throw error;
  } finally {
    await client.close();
  }
}

export default initDatabase;

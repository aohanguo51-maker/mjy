'use strict';
/**
 * scripts/init-db.js
 * 创建 10 个数据集合 + 建索引
 *
 * 使用方式：
 *   node scripts/init-db.js
 *
 * 前置：在环境变量中设置 SECRETID / SECRETKEY，或通过 tcb login 登录
 */

const tcb = require('@cloudbase/node-sdk');

const ENV_ID = 'pawmemory-d5gjmq8i444ffb334';

// 从环境变量读取密钥（本地跑脚本需要）
const app = tcb.init({
  env: ENV_ID,
  secretId: process.env.SECRETID,
  secretKey: process.env.SECRETKEY,
});

const db = app.database();

// 需要创建的集合及其索引定义
const COLLECTIONS = [
  {
    name: 'users',
    indexes: [
      { name: 'idx_phone', fields: [{ fieldPath: 'phone', order: 'ASC' }], unique: true },
    ],
  },
  {
    name: 'pets',
    indexes: [
      { name: 'idx_ownerId', fields: [{ fieldPath: 'ownerId', order: 'ASC' }] },
    ],
  },
  {
    name: 'memories',
    indexes: [
      { name: 'idx_ownerId_petId', fields: [{ fieldPath: 'ownerId', order: 'ASC' }, { fieldPath: 'petId', order: 'ASC' }] },
      { name: 'idx_createdAt', fields: [{ fieldPath: 'createdAt', order: 'DESC' }] },
    ],
  },
  {
    name: 'posts',
    indexes: [
      { name: 'idx_createdAt', fields: [{ fieldPath: 'createdAt', order: 'DESC' }] },
      { name: 'idx_authorId', fields: [{ fieldPath: 'authorId', order: 'ASC' }] },
      { name: 'idx_auditStatus', fields: [{ fieldPath: 'auditStatus', order: 'ASC' }] },
    ],
  },
  {
    name: 'comments',
    indexes: [
      { name: 'idx_postId', fields: [{ fieldPath: 'postId', order: 'ASC' }] },
    ],
  },
  {
    name: 'likes',
    indexes: [
      { name: 'idx_userId_postId', fields: [{ fieldPath: 'userId', order: 'ASC' }, { fieldPath: 'postId', order: 'ASC' }], unique: true },
    ],
  },
  {
    name: 'follows',
    indexes: [
      { name: 'idx_followerId_targetId', fields: [{ fieldPath: 'followerId', order: 'ASC' }, { fieldPath: 'targetId', order: 'ASC' }], unique: true },
    ],
  },
  {
    name: 'medical',
    indexes: [
      { name: 'idx_ownerId_petId', fields: [{ fieldPath: 'ownerId', order: 'ASC' }, { fieldPath: 'petId', order: 'ASC' }] },
    ],
  },
  {
    name: 'bills',
    indexes: [
      { name: 'idx_ownerId', fields: [{ fieldPath: 'ownerId', order: 'ASC' }] },
      { name: 'idx_createdAt', fields: [{ fieldPath: 'createdAt', order: 'DESC' }] },
    ],
  },
  {
    name: 'sms_codes',
    indexes: [
      { name: 'idx_phone', fields: [{ fieldPath: 'phone', order: 'ASC' }] },
      { name: 'idx_expiresAt', fields: [{ fieldPath: 'expiresAt', order: 'ASC' }] },
    ],
  },
];

async function createCollection(colName) {
  try {
    await db.createCollection(colName);
    console.log(`  ✅ 集合已创建：${colName}`);
  } catch (err) {
    if (err.message && (err.message.includes('exist') || err.message.includes('already') || err.message.includes('ALREADY'))) {
      console.log(`  ℹ️  集合已存在（跳过）：${colName}`);
    } else {
      throw err;
    }
  }
}

async function createIndex(colName, indexDef) {
  try {
    await db.collection(colName).createIndex({
      name: indexDef.name,
      fields: indexDef.fields,
      unique: indexDef.unique || false,
    });
    console.log(`    ✅ 索引已创建：${colName}.${indexDef.name}`);
  } catch (err) {
    if (err.message && (err.message.includes('exist') || err.message.includes('already') || err.message.includes('ALREADY') || err.message.includes('IndexKeySpecsConflict'))) {
      console.log(`    ℹ️  索引已存在（跳过）：${colName}.${indexDef.name}`);
    } else {
      console.warn(`    ⚠️  索引创建失败（${colName}.${indexDef.name}）：`, err.message);
    }
  }
}

async function main() {
  console.log('🚀 开始初始化数据库...');
  console.log(`   环境ID：${ENV_ID}\n`);

  for (const col of COLLECTIONS) {
    console.log(`\n📦 处理集合：${col.name}`);
    await createCollection(col.name);
    for (const idx of col.indexes || []) {
      await createIndex(col.name, idx);
    }
  }

  console.log('\n🎉 数据库初始化完成！');
  console.log('\n📌 下一步：运行 seed-official.js 写入官方示例内容');
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ 初始化失败：', err);
  process.exit(1);
});

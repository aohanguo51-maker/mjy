'use strict';
/**
 * 云函数：auth
 * 负责手机号登录（原型期固定验证码 123456）+ 签发会话 token
 *
 * actions:
 *   sendCode  { phone }         → 模拟发送验证码（直接返回成功）
 *   login     { phone, code }   → 校验验证码，upsert 用户，返回会话 token
 */

const tcb = require('@cloudbase/node-sdk');

// 初始化 SDK（云函数内自动注入凭证，无需手动传 secretId/secretKey）
const app = tcb.init({ env: process.env.TCB_ENV || 'pawmemory-d5gjmq8i444ffb334' });
const db = app.database();

const FIXED_CODE = '123456'; // 原型期固定验证码

// ── 轻量会话 token：HMAC-SHA256 签名，避免依赖控制台自定义登录配置 ──
// token 结构： base64url(payload).base64url(signature)
const crypto = require('crypto');
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'pawmemory-default-secret-change-me';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

function b64u(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}
function signToken(userId) {
  const payload = JSON.stringify({ uid: userId, exp: Date.now() + TOKEN_TTL_MS });
  const p = b64u(payload);
  const sig = b64u(crypto.createHmac('sha256', TOKEN_SECRET).update(p).digest());
  return p + '.' + sig;
}

// ── 默认宠物模板（首次注册时自动创建）──
function defaultPet(ownerId) {
  return {
    ownerId,
    name: '我的宝贝',
    emoji: '🐾',
    species: '待填写',
    kind: 'other',
    birthday: '',
    gender: '未知',
    neutered: false,
    weight: '',
    avaBg: 'linear-gradient(135deg,#ff8c5a,#ff2442)',
    dewormCycle: '',
    allergies: '',
    daily: { food: '正常', water: '正常', poop: '正常', weight: '', state: '正常', mood: '开心' },
    foodPrefs: { brand: '', snack: '', allergy: '' },
    isMemorial: false,
    createdAt: new Date(),
  };
}

exports.main = async (event, context) => {
  const { action, phone, code } = event;

  // ── sendCode ──────────────────────────────────────────
  if (action === 'sendCode') {
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return { code: 400, msg: '手机号格式不正确' };
    }
    // 原型期：不发真实短信，直接返回成功
    // 生产环境替换此处为腾讯云短信 SDK 调用
    return { code: 0, data: { msg: '验证码已发送（原型期固定为 123456）' } };
  }

  // ── login ──────────────────────────────────────────────
  if (action === 'login') {
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return { code: 400, msg: '手机号格式不正确' };
    }
    if (!code || code.trim() !== FIXED_CODE) {
      return { code: 401, msg: '验证码错误' };
    }

    try {
      // 查找是否已有该手机号的用户
      const usersCol = db.collection('users');
      const existRes = await usersCol.where({ phone }).get();

      let userId;
      let isNew = false;

      if (existRes.data && existRes.data.length > 0) {
        // 已有用户，更新 lastActiveAt
        userId = existRes.data[0]._id;
        await usersCol.doc(userId).update({ lastActiveAt: new Date() });
      } else {
        // 首次登录：创建用户
        isNew = true;
        const now = new Date();
        const addRes = await usersCol.add({
          phone,
          name: '宠物达人',
          avatarUrl: '',
          avatarEmoji: '😺',
          avatarType: 'emoji',
          bio: '',
          petYears: 1,
          joinedAt: now,
          lastActiveAt: now,
        });
        userId = addRes.id;

        // 同时创建一只默认宠物
        const petsCol = db.collection('pets');
        await petsCol.add(defaultPet(userId));
      }

      // 生成会话 token（HMAC 签名，无需控制台配置自定义登录私钥）
      const token = signToken(userId);

      return { code: 0, data: { token, userId, isNew } };
    } catch (err) {
      console.error('[auth/login]', err);
      return { code: 500, msg: '服务器错误：' + err.message };
    }
  }

  return { code: 404, msg: '未知 action: ' + action };
};

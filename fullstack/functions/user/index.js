'use strict';
/**
 * 云函数：user
 * 用户资料管理
 *
 * actions:
 *   get      {}             → 获取当前用户资料
 *   update   { name, avatarUrl, avatarEmoji, avatarType, bio, petYears }
 */

const tcb = require('@cloudbase/node-sdk');
const app = tcb.init({ env: process.env.TCB_ENV || 'pawmemory-d5gjmq8i444ffb334' });
const db = app.database();

// 从请求携带的会话 token 解析当前用户 uid（与 auth 云函数签发逻辑一致）
const crypto = require('crypto');
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'pawmemory-default-secret-change-me';

function b64u(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}
function getUid(context, event) {
  // 优先用平台原生登录态（如果将来启用了自定义登录，这里自动生效）
  if (context && context.TCB_UUID) return context.TCB_UUID;
  // 否则校验自签 token
  const token = event && event.__token;
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const [p, sig] = token.split('.');
  const expect = b64u(crypto.createHmac('sha256', TOKEN_SECRET).update(p).digest());
  if (sig !== expect) return null;
  try {
    const payload = JSON.parse(b64uDecode(p));
    if (!payload.uid || !payload.exp || Date.now() > payload.exp) return null;
    return payload.uid;
  } catch (e) { return null; }
}

exports.main = async (event, context) => {
  const uid = getUid(context, event);
  if (!uid) return { code: 401, msg: '未登录' };

  const { action } = event;
  const usersCol = db.collection('users');

  // ── get ──────────────────────────────────────────────
  if (action === 'get') {
    try {
      const res = await usersCol.doc(uid).get();
      if (!res.data) return { code: 404, msg: '用户不存在' };
      return { code: 0, data: res.data };
    } catch (err) {
      console.error('[user/get]', err);
      return { code: 500, msg: err.message };
    }
  }

  // ── update ────────────────────────────────────────────
  if (action === 'update') {
    const { name, avatarUrl, avatarEmoji, avatarType, bio, petYears } = event;
    const patch = {};
    if (name !== undefined) patch.name = String(name).slice(0, 30);
    if (avatarUrl !== undefined) patch.avatarUrl = avatarUrl;
    if (avatarEmoji !== undefined) patch.avatarEmoji = avatarEmoji;
    if (avatarType !== undefined) patch.avatarType = avatarType;
    if (bio !== undefined) patch.bio = String(bio).slice(0, 200);
    if (petYears !== undefined) patch.petYears = Number(petYears) || 0;
    patch.lastActiveAt = new Date();

    if (Object.keys(patch).length === 1) {
      return { code: 400, msg: '没有需要更新的字段' };
    }
    try {
      await usersCol.doc(uid).update(patch);
      return { code: 0, data: { updated: true } };
    } catch (err) {
      console.error('[user/update]', err);
      return { code: 500, msg: err.message };
    }
  }

  return { code: 404, msg: '未知 action: ' + action };
};

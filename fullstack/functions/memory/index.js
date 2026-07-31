'use strict';
/**
 * 云函数：memory
 * 记忆银行 CRUD + 相册聚合
 *
 * actions:
 *   list    { petId, page=1, pageSize=20 }      → 按宠物列记忆（按 createdAt desc）
 *   album   { petId, page=1, pageSize=30 }      → 只取含图片的记忆（相册视图）
 *   create  { petId, type, icon, title, desc, mood, fileIds[] }
 *   delete  { memoryId }
 */

const tcb = require('@cloudbase/node-sdk');
const app = tcb.init({ env: process.env.TCB_ENV || 'pawmemory-d5gjmq8i444ffb334' });
const db = app.database();
const _ = db.command;

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
  if (context && context.TCB_UUID) return context.TCB_UUID;
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

const VALID_TYPES = ['photo', 'audio', 'text', 'medical', 'daily', 'import', 'farewell'];

exports.main = async (event, context) => {
  const uid = getUid(context, event);
  if (!uid) return { code: 401, msg: '未登录' };

  const { action } = event;
  const memCol = db.collection('memories');

  // ── list ──────────────────────────────────────────────
  if (action === 'list') {
    const { petId } = event;
    if (!petId) return { code: 400, msg: 'petId 不能为空' };
    const page = Math.max(1, parseInt(event.page) || 1);
    const pageSize = Math.min(50, parseInt(event.pageSize) || 20);

    try {
      const res = await memCol
        .where({ ownerId: uid, petId })
        .orderBy('createdAt', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();
      return { code: 0, data: { list: res.data || [], page, pageSize } };
    } catch (err) {
      console.error('[memory/list]', err);
      return { code: 500, msg: err.message };
    }
  }

  // ── album ─────────────────────────────────────────────
  if (action === 'album') {
    const { petId } = event;
    if (!petId) return { code: 400, msg: 'petId 不能为空' };
    const page = Math.max(1, parseInt(event.page) || 1);
    const pageSize = Math.min(50, parseInt(event.pageSize) || 30);

    try {
      // 取 type=photo 或 fileIds 非空的记忆
      const res = await memCol
        .where({
          ownerId: uid,
          petId,
          type: 'photo',
        })
        .orderBy('createdAt', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();
      return { code: 0, data: { list: res.data || [], page, pageSize } };
    } catch (err) {
      console.error('[memory/album]', err);
      return { code: 500, msg: err.message };
    }
  }

  // ── create ────────────────────────────────────────────
  if (action === 'create') {
    const { petId, type, icon, title, desc, mood, fileIds } = event;
    if (!petId) return { code: 400, msg: 'petId 不能为空' };
    if (!type || !VALID_TYPES.includes(type)) {
      return { code: 400, msg: '记忆类型不合法，允许：' + VALID_TYPES.join('/') };
    }

    try {
      // 校验宠物归属
      const petRes = await db.collection('pets').doc(petId).get();
      if (!petRes.data) return { code: 404, msg: '宠物不存在' };
      if (petRes.data.ownerId !== uid) return { code: 403, msg: '无权访问该宠物' };

      const addRes = await memCol.add({
        ownerId: uid,
        petId,
        type,
        icon: icon || '📷',
        title: title || '',
        desc: desc || '',
        mood: mood || '',
        fileIds: Array.isArray(fileIds) ? fileIds.slice(0, 9) : [],
        createdAt: new Date(),
      });
      return { code: 0, data: { memoryId: addRes.id } };
    } catch (err) {
      console.error('[memory/create]', err);
      return { code: 500, msg: err.message };
    }
  }

  // ── delete ────────────────────────────────────────────
  if (action === 'delete') {
    const { memoryId } = event;
    if (!memoryId) return { code: 400, msg: 'memoryId 不能为空' };

    try {
      const docRes = await memCol.doc(memoryId).get();
      if (!docRes.data) return { code: 404, msg: '记忆不存在' };
      if (docRes.data.ownerId !== uid) return { code: 403, msg: '无权删除他人记忆' };

      await memCol.doc(memoryId).remove();
      return { code: 0, data: { deleted: true } };
    } catch (err) {
      console.error('[memory/delete]', err);
      return { code: 500, msg: err.message };
    }
  }

  // ── update ────────────────────────────────────────────
  if (action === 'update') {
    const { memoryId, title, desc, mood, fileIds } = event;
    if (!memoryId) return { code: 400, msg: 'memoryId 不能为空' };

    try {
      const docRes = await memCol.doc(memoryId).get();
      if (!docRes.data) return { code: 404, msg: '记忆不存在' };
      if (docRes.data.ownerId !== uid) return { code: 403, msg: '无权修改他人记忆' };

      const patch = { updatedAt: new Date() };
      if (typeof title === 'string') patch.title = title;
      if (typeof desc === 'string') patch.desc = desc;
      if (typeof mood === 'string') patch.mood = mood;
      if (Array.isArray(fileIds)) patch.fileIds = fileIds.slice(0, 9);

      await memCol.doc(memoryId).update(patch);
      return { code: 0, data: { updated: true } };
    } catch (err) {
      console.error('[memory/update]', err);
      return { code: 500, msg: err.message };
    }
  }

  return { code: 404, msg: '未知 action: ' + action };
};

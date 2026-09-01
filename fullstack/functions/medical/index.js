'use strict';
/**
 * 云函数：medical
 * 医疗记录 CRUD
 *
 * actions:
 *   list    { petId }
 *   create  { petId, date, title, badge, badgeClass, icon, note, fileIds[] }
 *   update  { recordId, ...fields }
 *   delete  { recordId }
 */

const tcb = require('@cloudbase/node-sdk');
const app = tcb.init({ env: process.env.TCB_ENV || 'pawmemory-d5gjmq8i444ffb334' });
const db = app.database();

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

const UPDATABLE_FIELDS = ['date', 'title', 'badge', 'badgeClass', 'icon', 'note', 'fileIds'];


// doc().get() 在不同 SDK 版本下可能返回对象或长度为1的数组，统一取成对象
function firstDoc(r) {
  let d = r && r.data;
  if (Array.isArray(d)) d = d[0];
  return d || null;
}

exports.main = async (event, context) => {
  const uid = getUid(context, event);
  if (!uid) return { code: 401, msg: '未登录' };

  const { action } = event;
  const medCol = db.collection('medical');

  // ── list ──────────────────────────────────────────────
  if (action === 'list') {
    const { petId } = event;
    if (!petId) return { code: 400, msg: 'petId 不能为空' };

    try {
      const res = await medCol
        .where({ ownerId: uid, petId })
        .orderBy('date', 'desc')
        .limit(50)
        .get();
      return { code: 0, data: { list: res.data || [] } };
    } catch (err) {
      console.error('[medical/list]', err);
      return { code: 500, msg: err.message };
    }
  }

  // ── create ────────────────────────────────────────────
  if (action === 'create') {
    const { petId, date, title, badge, badgeClass, icon, note, fileIds } = event;
    if (!petId) return { code: 400, msg: 'petId 不能为空' };
    if (!title || !title.trim()) return { code: 400, msg: '记录标题不能为空' };

    try {
      // 校验宠物归属
      const petRes = await db.collection('pets').doc(petId).get();
      if (!firstDoc(petRes)) return { code: 404, msg: '宠物不存在' };
      if (firstDoc(petRes).ownerId !== uid) return { code: 403, msg: '无权访问该宠物' };

      const addRes = await medCol.add({
        ownerId: uid,
        petId,
        date: date || new Date().toISOString().slice(0, 10),
        title: title.trim(),
        badge: badge || '体检',
        badgeClass: badgeClass || 'mb-checkup',
        icon: icon || '🔬',
        note: note || '',
        fileIds: Array.isArray(fileIds) ? fileIds.slice(0, 9) : [],
        createdAt: new Date(),
      });
      return { code: 0, data: { recordId: addRes.id } };
    } catch (err) {
      console.error('[medical/create]', err);
      return { code: 500, msg: err.message };
    }
  }

  // ── update ────────────────────────────────────────────
  if (action === 'update') {
    const { recordId } = event;
    if (!recordId) return { code: 400, msg: 'recordId 不能为空' };

    try {
      const docRes = await medCol.doc(recordId).get();
      if (!firstDoc(docRes)) return { code: 404, msg: '记录不存在' };
      if (firstDoc(docRes).ownerId !== uid) return { code: 403, msg: '无权修改他人记录' };

      const patch = {};
      UPDATABLE_FIELDS.forEach(f => {
        if (event[f] !== undefined) patch[f] = event[f];
      });
      if (Object.keys(patch).length === 0) return { code: 400, msg: '没有需要更新的字段' };

      await medCol.doc(recordId).update(patch);
      return { code: 0, data: { updated: true } };
    } catch (err) {
      console.error('[medical/update]', err);
      return { code: 500, msg: err.message };
    }
  }

  // ── delete ────────────────────────────────────────────
  if (action === 'delete') {
    const { recordId } = event;
    if (!recordId) return { code: 400, msg: 'recordId 不能为空' };

    try {
      const docRes = await medCol.doc(recordId).get();
      if (!firstDoc(docRes)) return { code: 404, msg: '记录不存在' };
      if (firstDoc(docRes).ownerId !== uid) return { code: 403, msg: '无权删除他人记录' };

      await medCol.doc(recordId).remove();
      return { code: 0, data: { deleted: true } };
    } catch (err) {
      console.error('[medical/delete]', err);
      return { code: 500, msg: err.message };
    }
  }

  return { code: 404, msg: '未知 action: ' + action };
};

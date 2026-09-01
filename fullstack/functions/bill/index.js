'use strict';
/**
 * 云函数：bill
 * 消费记账 CRUD
 *
 * actions:
 *   list      { petId?, year?, month?, page=1, pageSize=30 }
 *   create    { petId, category, icon, itemName, amount, date }
 *   delete    { billId }
 *   monthStat { year, month }    → 按分类统计当月消费
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

const VALID_CATEGORIES = ['food', 'toy', 'med', 'care', 'snack', 'other'];


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
  const billsCol = db.collection('bills');

  // ── list ──────────────────────────────────────────────
  if (action === 'list') {
    const page = Math.max(1, parseInt(event.page) || 1);
    const pageSize = Math.min(50, parseInt(event.pageSize) || 30);

    try {
      const query = { ownerId: uid };
      if (event.petId) query.petId = event.petId;

      const res = await billsCol
        .where(query)
        .orderBy('createdAt', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();
      return { code: 0, data: { list: res.data || [], page, pageSize } };
    } catch (err) {
      console.error('[bill/list]', err);
      return { code: 500, msg: err.message };
    }
  }

  // ── create ────────────────────────────────────────────
  if (action === 'create') {
    const { petId, category, icon, itemName, amount, date } = event;
    if (!itemName || !itemName.trim()) return { code: 400, msg: '购买内容不能为空' };
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) return { code: 400, msg: '金额必须大于0' };
    if (!petId) return { code: 400, msg: 'petId 不能为空' };

    try {
      // 校验宠物归属
      const petRes = await db.collection('pets').doc(petId).get();
      if (!firstDoc(petRes)) return { code: 404, msg: '宠物不存在' };
      if (firstDoc(petRes).ownerId !== uid) return { code: 403, msg: '无权访问该宠物' };

      const cat = VALID_CATEGORIES.includes(category) ? category : 'other';
      const now = new Date();
      const addRes = await billsCol.add({
        ownerId: uid,
        petId,
        category: cat,
        icon: icon || '💰',
        itemName: itemName.trim(),
        amount: parsedAmount,
        date: date || now.toISOString().slice(0, 10),
        createdAt: now,
      });
      return { code: 0, data: { billId: addRes.id } };
    } catch (err) {
      console.error('[bill/create]', err);
      return { code: 500, msg: err.message };
    }
  }

  // ── delete ────────────────────────────────────────────
  if (action === 'delete') {
    const { billId } = event;
    if (!billId) return { code: 400, msg: 'billId 不能为空' };

    try {
      const docRes = await billsCol.doc(billId).get();
      if (!firstDoc(docRes)) return { code: 404, msg: '账单不存在' };
      if (firstDoc(docRes).ownerId !== uid) return { code: 403, msg: '无权删除他人账单' };

      await billsCol.doc(billId).remove();
      return { code: 0, data: { deleted: true } };
    } catch (err) {
      console.error('[bill/delete]', err);
      return { code: 500, msg: err.message };
    }
  }

  // ── monthStat ─────────────────────────────────────────
  if (action === 'monthStat') {
    const year = parseInt(event.year) || new Date().getFullYear();
    const month = parseInt(event.month) || (new Date().getMonth() + 1);

    try {
      // 查当月数据（date 字段格式 YYYY-MM-DD）
      const monthStr = String(year) + '-' + String(month).padStart(2, '0');
      const res = await billsCol
        .where({
          ownerId: uid,
          date: db.RegExp({ regexp: '^' + monthStr, options: '' }),
        })
        .limit(100)
        .get();

      const records = res.data || [];
      const total = records.reduce((s, r) => s + (r.amount || 0), 0);
      const byCat = {};
      VALID_CATEGORIES.forEach(c => { byCat[c] = 0; });
      records.forEach(r => {
        const cat = VALID_CATEGORIES.includes(r.category) ? r.category : 'other';
        byCat[cat] += r.amount || 0;
      });

      return { code: 0, data: { year, month, total: Math.round(total * 100) / 100, byCat, count: records.length } };
    } catch (err) {
      console.error('[bill/monthStat]', err);
      return { code: 500, msg: err.message };
    }
  }

  return { code: 404, msg: '未知 action: ' + action };
};

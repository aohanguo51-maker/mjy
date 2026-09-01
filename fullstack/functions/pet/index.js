'use strict';
/**
 * 云函数：pet
 * 宠物 CRUD
 *
 * actions:
 *   list    {}                → 列出当前用户所有宠物
 *   create  { name, emoji, species, kind, birthday, gender, neutered, weight, avaBg, ... }
 *   update  { petId, ...fields }
 *   delete  { petId }
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

const UPDATABLE_FIELDS = [
  'name', 'emoji', 'species', 'kind', 'birthday', 'gender', 'neutered',
  'weight', 'avaBg', 'dewormCycle', 'allergies', 'daily', 'foodPrefs', 'isMemorial',
];


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
  const petsCol = db.collection('pets');

  // ── list ──────────────────────────────────────────────
  if (action === 'list') {
    try {
      const res = await petsCol.where({ ownerId: uid }).limit(20).get();
      return { code: 0, data: { pets: res.data || [] } };
    } catch (err) {
      console.error('[pet/list]', err);
      return { code: 500, msg: err.message };
    }
  }

  // ── create ────────────────────────────────────────────
  if (action === 'create') {
    const { name, emoji, species, kind, birthday, gender, neutered, weight, avaBg,
      dewormCycle, allergies } = event;
    if (!name || !name.trim()) return { code: 400, msg: '宠物名字不能为空' };

    try {
      const now = new Date();
      const addRes = await petsCol.add({
        ownerId: uid,
        name: name.trim(),
        emoji: emoji || '🐾',
        species: species || '',
        kind: kind || 'other',
        birthday: birthday || '',
        gender: gender || '未知',
        neutered: !!neutered,
        weight: weight || '',
        avaBg: avaBg || 'linear-gradient(135deg,#ff8c5a,#ff2442)',
        dewormCycle: dewormCycle || '',
        allergies: allergies || '',
        daily: { food: '正常', water: '正常', poop: '正常', weight: '', state: '正常', mood: '开心' },
        foodPrefs: { brand: '', snack: '', allergy: '' },
        isMemorial: false,
        createdAt: now,
      });
      return { code: 0, data: { petId: addRes.id } };
    } catch (err) {
      console.error('[pet/create]', err);
      return { code: 500, msg: err.message };
    }
  }

  // ── update ────────────────────────────────────────────
  if (action === 'update') {
    const { petId } = event;
    if (!petId) return { code: 400, msg: 'petId 不能为空' };

    try {
      // 校验归属
      const docRes = await petsCol.doc(petId).get();
      if (!firstDoc(docRes)) return { code: 404, msg: '宠物不存在' };
      if (firstDoc(docRes).ownerId !== uid) return { code: 403, msg: '无权修改他人宠物' };

      const patch = {};
      UPDATABLE_FIELDS.forEach(f => {
        if (event[f] !== undefined) patch[f] = event[f];
      });
      if (Object.keys(patch).length === 0) return { code: 400, msg: '没有需要更新的字段' };

      await petsCol.doc(petId).update(patch);
      return { code: 0, data: { updated: true } };
    } catch (err) {
      console.error('[pet/update]', err);
      return { code: 500, msg: err.message };
    }
  }

  // ── delete ────────────────────────────────────────────
  if (action === 'delete') {
    const { petId } = event;
    if (!petId) return { code: 400, msg: 'petId 不能为空' };

    try {
      const docRes = await petsCol.doc(petId).get();
      if (!firstDoc(docRes)) return { code: 404, msg: '宠物不存在' };
      if (firstDoc(docRes).ownerId !== uid) return { code: 403, msg: '无权删除他人宠物' };

      await petsCol.doc(petId).remove();
      return { code: 0, data: { deleted: true } };
    } catch (err) {
      console.error('[pet/delete]', err);
      return { code: 500, msg: err.message };
    }
  }

  return { code: 404, msg: '未知 action: ' + action };
};

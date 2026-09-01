'use strict';
/**
 * 云函数：interact
 * 互动：点赞/取消点赞、关注/取消关注、评论/评论列表、关注列表
 *
 * actions:
 *   like          { postId }
 *   unlike        { postId }
 *   follow        { targetId }      targetId: users._id 或 'official'
 *   unfollow      { targetId }
 *   comment       { postId, text }
 *   commentList   { postId, page=1, pageSize=20 }
 *   followList    { page=1, pageSize=30 }     → 当前用户关注的人列表
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

// 审核评论文本
async function auditText(text) {
  try {
    const res = await app.callFunction({
      name: 'audit',
      data: { action: 'check', text, fileIds: [] },
    });
    return res.result || { pass: true };
  } catch (e) {
    console.warn('[interact] audit error', e);
    return { pass: true };
  }
}


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
  const likesCol = db.collection('likes');
  const followsCol = db.collection('follows');
  const commentsCol = db.collection('comments');
  const postsCol = db.collection('posts');

  // ── like ──────────────────────────────────────────────
  if (action === 'like') {
    const { postId } = event;
    if (!postId) return { code: 400, msg: 'postId 不能为空' };

    try {
      // 幂等：已点赞则跳过
      const existRes = await likesCol.where({ userId: uid, postId }).limit(1).get();
      if (existRes.data && existRes.data.length > 0) {
        return { code: 0, data: { msg: '已点赞' } };
      }
      await likesCol.add({ userId: uid, postId, createdAt: new Date() });

      // 并发防护：高并发下上面的"先查后写"可能同时通过，
      // 这里写入后再确认一次，多余记录清掉，并按真实条数校准计数，
      // 保证 likeCount 永远等于 likes 表里的实际记录数。
      const afterRes = await likesCol.where({ userId: uid, postId }).get();
      const rows = afterRes.data || [];
      if (rows.length > 1) {
        // 只保留第一条，其余删除
        for (let i = 1; i < rows.length; i++) {
          await likesCol.doc(rows[i]._id).remove();
        }
      }
      const totalRes = await likesCol.where({ postId }).count();
      const realCount = (totalRes && typeof totalRes.total === 'number') ? totalRes.total : null;
      if (realCount !== null) {
        // 叠加展示基数，否则官方帖的 8600 赞会被拍成 1
        const pRes = await postsCol.doc(postId).get();
        const base = (firstDoc(pRes) && Number(firstDoc(pRes).baseLikeCount)) || 0;
        await postsCol.doc(postId).update({ likeCount: base + realCount });
      } else {
        await postsCol.doc(postId).update({ likeCount: _.inc(1) });
      }
      return { code: 0, data: { liked: true } };
    } catch (err) {
      console.error('[interact/like]', err);
      return { code: 500, msg: err.message };
    }
  }

  // ── unlike ────────────────────────────────────────────
  if (action === 'unlike') {
    const { postId } = event;
    if (!postId) return { code: 400, msg: 'postId 不能为空' };

    try {
      // 先确认确实点过赞，避免重复取消把计数减成负数
      const existRes = await likesCol.where({ userId: uid, postId }).limit(1).get();
      if (!existRes.data || existRes.data.length === 0) {
        return { code: 0, data: { liked: false, msg: '未点赞' } };
      }
      await likesCol.where({ userId: uid, postId }).remove();
      // 按真实记录数校准，避免并发或重复调用导致计数漂移为负
      const totalRes = await likesCol.where({ postId }).count();
      const realCount = (totalRes && typeof totalRes.total === 'number') ? totalRes.total : null;
      if (realCount !== null) {
        const pRes = await postsCol.doc(postId).get();
        const base = (firstDoc(pRes) && Number(firstDoc(pRes).baseLikeCount)) || 0;
        await postsCol.doc(postId).update({ likeCount: base + realCount });
      } else {
        await postsCol.doc(postId).update({ likeCount: _.inc(-1) });
      }
      return { code: 0, data: { liked: false } };
    } catch (err) {
      console.error('[interact/unlike]', err);
      return { code: 500, msg: err.message };
    }
  }

  // ── follow ────────────────────────────────────────────
  if (action === 'follow') {
    const { targetId } = event;
    if (!targetId) return { code: 400, msg: 'targetId 不能为空' };
    if (targetId === uid) return { code: 400, msg: '不能关注自己' };

    try {
      const existRes = await followsCol.where({ followerId: uid, targetId }).limit(1).get();
      if (existRes.data && existRes.data.length > 0) {
        return { code: 0, data: { msg: '已关注' } };
      }
      await followsCol.add({ followerId: uid, targetId, createdAt: new Date() });
      return { code: 0, data: { followed: true } };
    } catch (err) {
      console.error('[interact/follow]', err);
      return { code: 500, msg: err.message };
    }
  }

  // ── unfollow ──────────────────────────────────────────
  if (action === 'unfollow') {
    const { targetId } = event;
    if (!targetId) return { code: 400, msg: 'targetId 不能为空' };

    try {
      await followsCol.where({ followerId: uid, targetId }).remove();
      return { code: 0, data: { followed: false } };
    } catch (err) {
      console.error('[interact/unfollow]', err);
      return { code: 500, msg: err.message };
    }
  }

  // ── comment ───────────────────────────────────────────
  if (action === 'comment') {
    const { postId, text } = event;
    if (!postId) return { code: 400, msg: 'postId 不能为空' };
    if (!text || !text.trim()) return { code: 400, msg: '评论内容不能为空' };
    if (text.trim().length > 500) return { code: 400, msg: '评论不能超过500字' };

    try {
      // 获取用户信息
      const userRes = await db.collection('users').doc(uid).get();
      if (!firstDoc(userRes)) return { code: 404, msg: '用户不存在' };

      // 审核评论
      const auditResult = await auditText(text.trim());
      const auditStatus = auditResult.pass ? 'pass' : 'reject';
      if (auditStatus === 'reject') {
        return { code: 400, msg: '评论内容不符合社区规范，请修改后重试' };
      }

      const addRes = await commentsCol.add({
        postId,
        userId: uid,
        userName: firstDoc(userRes).name,
        text: text.trim(),
        createdAt: new Date(),
        auditStatus,
      });
      // 更新帖子评论数
      await postsCol.doc(postId).update({ commentCount: _.inc(1) });

      return { code: 0, data: { commentId: addRes.id } };
    } catch (err) {
      console.error('[interact/comment]', err);
      return { code: 500, msg: err.message };
    }
  }

  // ── commentList ───────────────────────────────────────
  if (action === 'commentList') {
    const { postId } = event;
    if (!postId) return { code: 400, msg: 'postId 不能为空' };
    const page = Math.max(1, parseInt(event.page) || 1);
    const pageSize = Math.min(50, parseInt(event.pageSize) || 20);

    try {
      const res = await commentsCol
        .where({ postId, auditStatus: 'pass' })
        .orderBy('createdAt', 'asc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();
      return { code: 0, data: { list: res.data || [], page, pageSize } };
    } catch (err) {
      console.error('[interact/commentList]', err);
      return { code: 500, msg: err.message };
    }
  }

  // ── followList ────────────────────────────────────────
  if (action === 'followList') {
    const page = Math.max(1, parseInt(event.page) || 1);
    const pageSize = Math.min(50, parseInt(event.pageSize) || 30);

    try {
      const res = await followsCol
        .where({ followerId: uid })
        .orderBy('createdAt', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();
      const follows = res.data || [];

      // 批量拉取被关注用户的资料（排除 official 虚拟账号）
      const realIds = follows.map(f => f.targetId).filter(id => id !== 'official');
      let usersMap = {};
      if (realIds.length > 0) {
        const usersRes = await db.collection('users')
          .where({ _id: _.in(realIds) })
          .limit(realIds.length)
          .get();
        (usersRes.data || []).forEach(u => { usersMap[u._id] = u; });
      }

      const enriched = follows.map(f => ({
        targetId: f.targetId,
        createdAt: f.createdAt,
        user: f.targetId === 'official'
          ? { _id: 'official', name: '官方账号', avatarEmoji: '🐾', avatarType: 'emoji' }
          : (usersMap[f.targetId] || { _id: f.targetId, name: '未知用户' }),
      }));

      return { code: 0, data: { list: enriched, page, pageSize } };
    } catch (err) {
      console.error('[interact/followList]', err);
      return { code: 500, msg: err.message };
    }
  }

  return { code: 404, msg: '未知 action: ' + action };
};

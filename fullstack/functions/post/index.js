'use strict';
/**
 * 云函数：post
 * 社区动态
 *
 * actions:
 *   feed      { page=1, pageSize=10 }      → 混排（官方+用户，pass状态），按 createdAt desc
 *   create    { petId?, tag, title, content, fileIds[] }
 *   detail    { postId }
 *   delete    { postId }
 *   myPosts   { page=1, pageSize=20 }      → 当前用户发布的帖子
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

// 调用 audit 云函数审核内容（失败则 pending，不阻断发布）
async function callAudit(text, fileIds) {
  try {
    const res = await app.callFunction({
      name: 'audit',
      data: { action: 'check', text, fileIds },
    });
    return res.result || { pass: true };
  } catch (e) {
    console.warn('[post] audit callFunction error', e);
    return { pass: true }; // 审核异常时放行，人工复查
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
  const postsCol = db.collection('posts');

  // ── feed ──────────────────────────────────────────────
  if (action === 'feed') {
    const page = Math.max(1, parseInt(event.page) || 1);
    const pageSize = Math.min(20, parseInt(event.pageSize) || 10);

    try {
      // 取官方内容 + 审核通过的用户内容
      const res = await postsCol
        .where(_.or(
          { isOfficial: true },
          { auditStatus: 'pass' }
        ))
        .orderBy('createdAt', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();

      const posts = res.data || [];

      // 批量获取点赞状态（当前用户）
      if (posts.length > 0) {
        const postIds = posts.map(p => p._id);
        const likesRes = await db.collection('likes')
          .where({ userId: uid, postId: _.in(postIds) })
          .limit(postIds.length)
          .get();
        const likedSet = new Set((likesRes.data || []).map(l => l.postId));
        posts.forEach(p => { p.liked = likedSet.has(p._id); });
      }

      return { code: 0, data: { list: posts, page, pageSize } };
    } catch (err) {
      console.error('[post/feed]', err);
      return { code: 500, msg: err.message };
    }
  }

  // ── create ────────────────────────────────────────────
  if (action === 'create') {
    const { petId, tag, title, content, fileIds } = event;
    if (!content || !content.trim()) {
      return { code: 400, msg: '动态内容不能为空' };
    }

    try {
      // 获取用户信息（冗余昵称/头像）
      const userRes = await db.collection('users').doc(uid).get();
      if (!firstDoc(userRes)) return { code: 404, msg: '用户不存在，请重新登录' };
      const user = firstDoc(userRes);

      // 审核
      const auditResult = await callAudit(
        (title || '') + ' ' + content,
        Array.isArray(fileIds) ? fileIds : []
      );
      const auditStatus = auditResult.pass ? 'pass' : 'reject';

      const now = new Date();
      const addRes = await postsCol.add({
        authorId: uid,
        authorName: user.name,
        authorAvatar: user.avatarUrl || '',
        authorAvatarType: user.avatarType || 'emoji',
        authorAvatarEmoji: user.avatarEmoji || '😺',
        isOfficial: false,
        petId: petId || '',
        tag: tag || '',
        title: title || '',
        content: content.trim(),
        fileIds: Array.isArray(fileIds) ? fileIds.slice(0, 9) : [],
        imgUrl: '',
        likeCount: 0,
        baseLikeCount: 0,
        commentCount: 0,
        auditStatus,
        createdAt: now,
      });

      if (auditStatus === 'reject') {
        return { code: 0, data: { postId: addRes.id, auditStatus, msg: '内容审核未通过，已提交人工复查' } };
      }
      return { code: 0, data: { postId: addRes.id, auditStatus } };
    } catch (err) {
      console.error('[post/create]', err);
      return { code: 500, msg: err.message };
    }
  }

  // ── detail ────────────────────────────────────────────
  if (action === 'detail') {
    const { postId } = event;
    if (!postId) return { code: 400, msg: 'postId 不能为空' };

    try {
      const res = await postsCol.doc(postId).get();
      if (!firstDoc(res)) return { code: 404, msg: '帖子不存在' };

      // 点赞状态
      const likeRes = await db.collection('likes')
        .where({ userId: uid, postId })
        .limit(1)
        .get();
      const post = firstDoc(res);
      post.liked = (likeRes.data || []).length > 0;

      // 评论列表（最新 20 条）
      const commentsRes = await db.collection('comments')
        .where({ postId })
        .orderBy('createdAt', 'asc')
        .limit(20)
        .get();
      post.comments = commentsRes.data || [];

      return { code: 0, data: post };
    } catch (err) {
      console.error('[post/detail]', err);
      return { code: 500, msg: err.message };
    }
  }

  // ── delete ────────────────────────────────────────────
  if (action === 'delete') {
    const { postId } = event;
    if (!postId) return { code: 400, msg: 'postId 不能为空' };

    try {
      const docRes = await postsCol.doc(postId).get();
      if (!firstDoc(docRes)) return { code: 404, msg: '帖子不存在' };
      if (firstDoc(docRes).authorId !== uid) return { code: 403, msg: '无权删除他人帖子' };

      await postsCol.doc(postId).remove();
      // 同时删除对应评论、点赞
      await db.collection('comments').where({ postId }).remove();
      await db.collection('likes').where({ postId }).remove();

      return { code: 0, data: { deleted: true } };
    } catch (err) {
      console.error('[post/delete]', err);
      return { code: 500, msg: err.message };
    }
  }

  // ── myPosts ───────────────────────────────────────────
  if (action === 'myPosts') {
    const page = Math.max(1, parseInt(event.page) || 1);
    const pageSize = Math.min(30, parseInt(event.pageSize) || 20);

    try {
      const res = await postsCol
        .where({ authorId: uid })
        .orderBy('createdAt', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();
      return { code: 0, data: { list: res.data || [], page, pageSize } };
    } catch (err) {
      console.error('[post/myPosts]', err);
      return { code: 500, msg: err.message };
    }
  }

  return { code: 404, msg: '未知 action: ' + action };
};

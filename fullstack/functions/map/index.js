'use strict';
/**
 * 云函数：map —— 高德地图代理
 *
 * 作用：把高德 key 收到云端，前端不再持有。
 * 之前 key 硬编码在 index.html 里，任何人 F12 就能扒走盗刷配额。
 *
 * actions:
 *   around  { lng, lat, keyword, radius }  → 周边 POI（宠物店/医院）
 *   static  { lng, lat, zoom, size, markers } → 静态地图图片 URL（已签好 key）
 *
 * 环境变量：
 *   AMAP_KEY   高德 Web服务 API Key
 */

const crypto = require('crypto');

const AMAP_KEY = process.env.AMAP_KEY || '';

// ── 会话校验（与其它函数一致）──
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

// 只允许这几个关键词，避免函数被当成任意高德查询代理刷配额
const ALLOWED_KEYWORDS = ['宠物店', '宠物医院', '宠物美容', '宠物公园'];

function num(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

exports.main = async (event, context) => {
  const uid = getUid(context, event);
  if (!uid) return { code: 401, msg: '未登录' };

  if (!AMAP_KEY) {
    console.warn('[map] AMAP_KEY 未配置');
    return { code: 0, data: { degraded: true, pois: [], msg: '地图服务未配置' } };
  }

  const { action } = event;

  // ── around：周边 POI ──
  if (action === 'around') {
    const lng = num(event.lng, 116.397);
    const lat = num(event.lat, 39.909);
    const radius = Math.min(50000, Math.max(500, num(event.radius, 5000)));
    let keyword = String(event.keyword || '宠物医院');
    if (!ALLOWED_KEYWORDS.includes(keyword)) keyword = '宠物医院';

    const url = 'https://restapi.amap.com/v3/place/around'
      + '?key=' + encodeURIComponent(AMAP_KEY)
      + '&location=' + lng + ',' + lat
      + '&keywords=' + encodeURIComponent(keyword)
      + '&radius=' + radius
      + '&offset=10&page=1&extensions=all';

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.status !== '1' || !Array.isArray(data.pois)) {
        console.warn('[map/around] 高德返回异常', data && data.info);
        return { code: 0, data: { degraded: true, pois: [], msg: (data && data.info) || '高德无数据' } };
      }
      const pois = data.pois.slice(0, 10).map(p => {
        const [plng, plat] = String(p.location || '0,0').split(',').map(Number);
        return {
          name: p.name,
          address: p.address && String(p.address) ? String(p.address) : '地址未提供',
          distance: p.distance ? Number(p.distance) : null,
          tel: (p.tel && String(p.tel)) || '',
          lng: plng, lat: plat,
        };
      });
      return { code: 0, data: { degraded: false, keyword, pois } };
    } catch (err) {
      console.error('[map/around]', err);
      return { code: 0, data: { degraded: true, pois: [], msg: '地图服务暂时不可用' } };
    }
  }

  // ── static：静态地图（key 在服务端拼好，前端只拿到图片 URL）──
  if (action === 'static') {
    const lng = num(event.lng, 116.397);
    const lat = num(event.lat, 39.909);
    const zoom = Math.min(17, Math.max(3, num(event.zoom, 14)));
    const size = /^\d{2,4}\*\d{2,4}$/.test(event.size || '') ? event.size : '750*300';
    let markers = '';
    if (Array.isArray(event.markers) && event.markers.length) {
      const pts = event.markers.slice(0, 20)
        .filter(m => Number.isFinite(Number(m.lng)) && Number.isFinite(Number(m.lat)))
        .map(m => Number(m.lng) + ',' + Number(m.lat)).join(';');
      if (pts) markers = '&markers=mid,0xFF2442,:' + pts;
    }
    const url = 'https://restapi.amap.com/v3/staticmap'
      + '?key=' + encodeURIComponent(AMAP_KEY)
      + '&location=' + lng + ',' + lat
      + '&zoom=' + zoom + '&size=' + size + '&scale=2' + markers;
    return { code: 0, data: { url } };
  }

  return { code: 404, msg: '未知 action: ' + action };
};

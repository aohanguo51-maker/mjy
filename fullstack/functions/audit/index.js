'use strict';
/**
 * 云函数：audit
 * 内容安全审核（UGC 合规）
 *
 * 使用腾讯云内容安全：
 *   - TMS（文本）：TextModeration
 *   - IMS（图片）：ImageModeration（通过 fileID 换临时 URL 后传入）
 *
 * actions:
 *   check   { text?, fileIds? }   → { pass: boolean, suggestion, detail }
 *
 * 环境变量（在 CloudBase 控制台 → 云函数 → 环境变量 中配置）：
 *   CMS_SECRET_ID    腾讯云 SecretId（可用子账号，最小权限：QcloudTMSFullAccess + QcloudIMSFullAccess）
 *   CMS_SECRET_KEY   腾讯云 SecretKey
 *   CMS_REGION       地域，默认 ap-shanghai
 *
 * 未配置密钥时降级为"放行"（原型期可用），并打印警告。
 */

const tcb = require('@cloudbase/node-sdk');
const app = tcb.init({ env: process.env.TCB_ENV || 'pawmemory-d5gjmq8i444ffb334' });

// ── 腾讯云内容安全 SDK（懒加载，未安装时不崩溃）──
let tencentcloud = null;
function getTencentCloud() {
  if (!tencentcloud) {
    try {
      tencentcloud = require('tencentcloud-sdk-nodejs');
    } catch (e) {
      console.warn('[audit] tencentcloud-sdk-nodejs not installed, audit disabled');
    }
  }
  return tencentcloud;
}

const SECRET_ID = process.env.CMS_SECRET_ID || '';
const SECRET_KEY = process.env.CMS_SECRET_KEY || '';
const REGION = process.env.CMS_REGION || 'ap-shanghai';

// 是否已配置密钥
function hasCredentials() {
  return SECRET_ID && SECRET_KEY;
}

// ── 文本审核 ──────────────────────────────────────────
async function auditText(text) {
  if (!hasCredentials()) {
    console.warn('[audit] CMS credentials not configured, skipping text audit');
    return { pass: true, suggestion: 'Pass', detail: 'no credentials' };
  }
  const tc = getTencentCloud();
  if (!tc) return { pass: true, suggestion: 'Pass', detail: 'sdk not installed' };

  const TmsClient = tc.tms.v20201229.Client;
  const client = new TmsClient({
    credential: { secretId: SECRET_ID, secretKey: SECRET_KEY },
    region: REGION,
    profile: { httpProfile: { endpoint: 'tms.tencentcloudapi.com' } },
  });

  try {
    const res = await client.TextModeration({ Content: Buffer.from(text).toString('base64') });
    const suggestion = res.Suggestion; // 'Pass' | 'Block' | 'Review'
    return {
      pass: suggestion === 'Pass',
      suggestion,
      detail: res.Keywords || [],
    };
  } catch (err) {
    console.error('[audit/text]', err);
    return { pass: true, suggestion: 'Pass', detail: 'api error: ' + err.message };
  }
}

// ── 图片审核（通过 fileID 换临时 URL）──────────────────
async function auditImage(fileId) {
  if (!hasCredentials()) {
    return { pass: true, suggestion: 'Pass' };
  }
  const tc = getTencentCloud();
  if (!tc) return { pass: true, suggestion: 'Pass' };

  try {
    // 获取临时 URL
    const tempRes = await app.getTempFileURL({ fileList: [fileId] });
    if (!tempRes.fileList || !tempRes.fileList[0] || tempRes.fileList[0].status !== 0) {
      return { pass: true, suggestion: 'Pass', detail: 'get temp url failed' };
    }
    const imageUrl = tempRes.fileList[0].tempFileURL;

    const ImsClient = tc.ims.v20201229.Client;
    const client = new ImsClient({
      credential: { secretId: SECRET_ID, secretKey: SECRET_KEY },
      region: REGION,
      profile: { httpProfile: { endpoint: 'ims.tencentcloudapi.com' } },
    });

    const res = await client.ImageModeration({ FileURL: imageUrl });
    const suggestion = res.Suggestion;
    return { pass: suggestion === 'Pass', suggestion };
  } catch (err) {
    console.error('[audit/image]', err, fileId);
    return { pass: true, suggestion: 'Pass', detail: 'api error: ' + err.message };
  }
}

exports.main = async (event, context) => {
  const { action, text, fileIds } = event;

  if (action === 'check') {
    const results = [];

    // 文本审核
    if (text && text.trim()) {
      const textResult = await auditText(text.trim());
      results.push({ type: 'text', ...textResult });
    }

    // 图片审核（最多 9 张，体验版配额有限，建议先只审文本）
    if (Array.isArray(fileIds) && fileIds.length > 0) {
      for (const fid of fileIds.slice(0, 9)) {
        const imgResult = await auditImage(fid);
        results.push({ type: 'image', fileId: fid, ...imgResult });
      }
    }

    const allPass = results.length === 0 || results.every(r => r.pass);
    return {
      code: 0,
      data: {
        pass: allPass,
        suggestion: allPass ? 'Pass' : 'Block',
        detail: results,
      },
      // 兼容旧的调用方（直接取 result.pass）
      pass: allPass,
    };
  }

  return { code: 404, msg: '未知 action: ' + action };
};

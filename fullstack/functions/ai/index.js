'use strict';
/**
 * 云函数：ai —— 真实大模型能力层（DeepSeek）
 *
 * actions:
 *   vet  { pet, symptom, desc }  → 养宠问答建议
 *
 * 环境变量（CloudBase 控制台 → 云函数 → ai → 环境变量）：
 *   DEEPSEEK_API_KEY   必填，DeepSeek 开放平台申请
 *   DEEPSEEK_MODEL     选填，默认 deepseek-chat
 *
 * 安全设计：
 *   1. key 只存在云端环境变量，绝不下发前端
 *   2. 急症关键词命中时直接返回送医警告，不经过模型（模型可能说软话耽误病情）
 *   3. 模型不可用时降级为保守建议 + 建议就医，而不是报错白屏
 */

const crypto = require('crypto');

const API_KEY = process.env.DEEPSEEK_API_KEY || '';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const ENDPOINT = 'https://api.deepseek.com/chat/completions';

// ── 会话校验（与其它函数一致的 HMAC 方案）──
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

// ── 急症红线：命中直接送医，不让模型有机会说软话 ──
const EMERGENCY_PATTERNS = [
  { re: /吐血|呕血|便血|血便|尿血|血尿|血丝|带血|有血|出血|喷血/, why: '出血' },
  { re: /抽搐|抽风|痉挛|癫痫|口吐白沫/, why: '神经症状' },
  { re: /没(有)?呼吸|不(能|会)呼吸|呼吸困难|窒息|喘不上/, why: '呼吸窘迫' },
  { re: /昏迷|不省人事|叫不醒|失去意识/, why: '意识障碍' },
  { re: /误食|误吞|中毒|吃了(老鼠药|巧克力|洋葱|药)/, why: '疑似中毒' },
  { re: /车祸|摔伤|骨折|被咬伤|大出血/, why: '外伤' },
  { re: /难产|生不出|胎儿卡/, why: '难产' },
  { re: /尿不出|排不出尿|憋尿|尿闭/, why: '尿路梗阻' },
  { re: /肚子(胀|鼓)得(很)?大|腹部膨大|胃扭转/, why: '急腹症' },
  { re: /体温(过低|很低)|四肢冰凉|休克|牙龈发白/, why: '休克征象' },
  { re: /持续呕吐|吐了好几天|吐了三天|一直吐/, why: '持续呕吐' },
  { re: /完全不吃|一口不吃|拒食|不吃不喝/, why: '完全拒食' },
];
function checkEmergency(text) {
  if (!text) return null;
  for (const p of EMERGENCY_PATTERNS) {
    if (p.re.test(text)) return p.why;
  }
  return null;
}

// ── 兜底建议（模型不可用时用，保守且一定劝就医）──
function fallbackAdvice(symptom) {
  return {
    urgent: false,
    degraded: true,
    title: '暂时无法生成个性化建议',
    reason: '智能问答服务暂时不可用。',
    advice: `关于「${symptom || '这个症状'}」，建议先记录出现的时间、频率和伴随表现（食欲、精神、排泄），` +
            `保证饮水，避免自行用药。如果症状持续超过 24 小时、加重，或出现精神萎靡、拒食，请尽快就医。`,
    disclaimer: '本内容仅供参考，不能替代执业兽医诊断。',
  };
}

async function callDeepSeek(messages) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + API_KEY,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.3,       // 医疗相关，降低随机性
      max_tokens: 700,
      stream: false,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('DeepSeek HTTP ' + res.status + ' ' + t.slice(0, 200));
  }
  const data = await res.json();
  const content = data && data.choices && data.choices[0] &&
                  data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error('DeepSeek 返回内容为空');
  return content;
}

const SYSTEM_PROMPT = `你是一位有 15 年临床经验的小动物执业兽医，正在通过 App 回答宠物主人的咨询。

要求：
1. 先判断紧急程度，分三档：立即就医 / 24小时内就医 / 可先观察。把判断放在最前面，一句话说清。
2. 结合主人给出的宠物档案（品种、年龄、绝育情况、体重、过敏史）做针对性分析，不要说套话。
3. 认真读主人的补充描述，那里面往往有关键信息（持续时间、伴随症状、诱因）。
4. 给出 3-5 条具体可执行的建议，说明在家能做什么、什么情况必须去医院。
5. 不要开处方药、不要给具体药物剂量。
6. 用平实的中文，像跟朋友说话，不要用"您"，不要堆专业术语。控制在 300 字以内。
7. 不确定的地方就说不确定，不要编造。

输出纯文本，不要用 markdown 标题符号。`;

exports.main = async (event, context) => {
  const uid = getUid(context, event);
  if (!uid) return { code: 401, msg: '未登录' };

  const { action } = event;

  if (action === 'vet') {
    const pet = event.pet || {};
    const symptom = String(event.symptom || '').slice(0, 50);
    const desc = String(event.desc || '').slice(0, 800);

    // ① 急症红线优先，绕过模型
    const emergency = checkEmergency(symptom + ' ' + desc);
    if (emergency) {
      return {
        code: 0,
        data: {
          urgent: true,
          emergencyType: emergency,
          title: '⚠️ 这种情况请立即送医',
          reason: `你描述的情况涉及「${emergency}」，属于急症信号。`,
          advice: '请立刻带它去最近的宠物医院，路上保持安静保暖，不要喂食喂水，不要自行给药。' +
                  '如果有呕吐物、排泄物或误食的包装，一并带上给医生看。时间就是命，别等观察。',
          disclaimer: '本提示不替代诊断，但这类症状不建议在家观察。',
        },
      };
    }

    // ② 没配 key 时明确降级，不假装有 AI
    if (!API_KEY) {
      console.warn('[ai/vet] DEEPSEEK_API_KEY 未配置，返回降级建议');
      return { code: 0, data: fallbackAdvice(symptom) };
    }

    // ③ 正常走模型
    const petLine = [
      pet.name ? `名字：${pet.name}` : '',
      pet.species ? `品种：${pet.species}` : '',
      pet.age ? `年龄：${pet.age}` : '',
      pet.gender ? `性别：${pet.gender}` : '',
      pet.weight ? `体重：${pet.weight}` : '',
      typeof pet.neutered !== 'undefined' ? `绝育：${pet.neutered ? '已绝育' : '未绝育'}` : '',
      pet.allergies ? `过敏史：${pet.allergies}` : '',
    ].filter(Boolean).join('，');

    const userMsg =
      `宠物档案：${petLine || '主人未填写完整档案'}\n` +
      `主诉症状：${symptom || '未选择'}\n` +
      `补充描述：${desc || '（主人没有补充）'}\n\n` +
      `请按要求给出判断和建议。`;

    try {
      const content = await callDeepSeek([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ]);
      return {
        code: 0,
        data: {
          urgent: false,
          degraded: false,
          model: MODEL,
          content,
          disclaimer: '以上内容由 AI 生成，仅供参考，不能替代执业兽医的当面诊断。',
        },
      };
    } catch (err) {
      console.error('[ai/vet] 模型调用失败', err);
      return { code: 0, data: fallbackAdvice(symptom) };
    }
  }

  return { code: 404, msg: '未知 action: ' + action };
};

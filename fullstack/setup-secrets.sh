#!/bin/bash
# 一键写入密钥到 cloudbaserc.json（新版 CLI 用配置文件驱动环境变量）
# 用法：bash setup-secrets.sh 你的SiliconFlowKey
set -e
SF_KEY="${1:-}"
if [ -z "$SF_KEY" ]; then
  echo "❌ 用法: bash setup-secrets.sh sk-你的硅基流动key"
  exit 1
fi
python3 - "$SF_KEY" <<'PY'
import json, secrets, sys, os
sf = sys.argv[1]
amap = 'fc8dbcf035ed9e6809754580988af7e8'
p = 'cloudbaserc.json'
d = json.load(open(p, encoding='utf-8'))

# 复用已有 TOKEN_SECRET，没有才新生成，避免重复执行把登录态冲掉
old = None
for f in d.get('functions', []):
    ev = f.get('envVariables') or {}
    if ev.get('TOKEN_SECRET'):
        old = ev['TOKEN_SECRET']; break
token = old or secrets.token_hex(32)

need = ['auth','user','pet','memory','post','interact','medical','bill','ai','map']
for f in d['functions']:
    ev = f.get('envVariables') or {}
    if f['name'] in need:
        ev['TOKEN_SECRET'] = token
    if f['name'] == 'ai':
        ev['SILICONFLOW_API_KEY'] = sf
    if f['name'] == 'map':
        ev['AMAP_KEY'] = amap
    f['envVariables'] = ev

json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('✅ 已写入配置')
print('   登录密钥 TOKEN_SECRET :', ('复用已有' if old else '新生成') , token[:16] + '...')
print('   AI 密钥   → ai 函数')
print('   高德密钥  → map 函数')
print('')
print('📝 请把完整 TOKEN_SECRET 存到备忘录：')
print('   ' + token)
PY

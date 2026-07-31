# 毛记忆 PawMemory —— CloudBase 全栈部署指南

> 这份文档是写给普通用户的，照着一步步做就能把应用跑起来。
> 遇到问题先看最后的「常见问题」章节。

---

## 目录

1. [前置准备](#1-前置准备)
2. [登录 CloudBase](#2-登录-cloudbase)
3. [控制台手动配置（必做）](#3-控制台手动配置必做)
4. [安装脚本依赖](#4-安装脚本依赖)
5. [初始化数据库](#5-初始化数据库)
6. [部署云函数](#6-部署云函数)
7. [部署静态网站](#7-部署静态网站)
8. [访问你的应用](#8-访问你的应用)
9. [常见问题排查](#9-常见问题排查)
10. [后续维护](#10-后续维护)

---

## 1. 前置准备

### 1.1 安装 Node.js

确保本机已安装 Node.js 18+：

```bash
node --version   # 应显示 v18.x.x 或更高
```

如果没有，前往 [nodejs.org](https://nodejs.org) 下载安装。

### 1.2 安装 CloudBase CLI

```bash
npm install -g @cloudbase/cli
```

验证安装成功：

```bash
tcb --version
```

---

## 2. 登录 CloudBase

```bash
tcb login
```

执行后会自动打开浏览器，用**腾讯云账号**扫码或密码登录。

成功后终端显示：`登录成功`

---

## 3. 控制台手动配置（必做）

以下配置需要在**腾讯云控制台**完成，无法通过 CLI 自动化。

控制台入口：  
👉 https://console.cloud.tencent.com/tcb/env/index?envId=pawmemory-d5gjmq8i444ffb334

---

### 3.1 设置登录密钥（推荐，1 分钟）

本项目的登录不依赖 CloudBase 自定义登录，**无需在控制台开任何登录开关**。
登录态由云函数自己签发的 token 维持，只需要设置一个签名密钥。

> 不做这一步也能跑（会用默认密钥），但**正式给用户用之前务必设置**，否则 token 可能被伪造。

在项目根目录执行（把 `你的随机密钥` 换成一串随机字符，越长越好）：

```bash
tcb fn config update auth --envId pawmemory-d5gjmq8i444ffb334 \
  --envVariables TOKEN_SECRET=你的随机密钥
```

然后给其他 7 个函数设置**同样的密钥**（必须一致，否则验证会失败）：

```bash
for fn in user pet memory post interact medical bill; do
  tcb fn config update $fn --envId pawmemory-d5gjmq8i444ffb334 \
    --envVariables TOKEN_SECRET=你的随机密钥
done
```

生成随机密钥的小技巧（Mac/Linux 终端直接运行）：

```bash
openssl rand -hex 32
```

---

### 3.2 开启云存储

1. 控制台 → **「云存储」**
2. 确认已开启（体验版默认开启，查看存储桶是否存在）
3. 设置**存储权限**：  
   - 进入云存储 → 「权限设置」  
   - 将图片目录（`/avatars/`、`/posts/`、`/memories/`、`/medical/`）设置为「仅创建者可读写」
   - 或使用默认的「所有用户可读，仅创建者可写」

---

### 3.3 开通内容安全服务（可选，上线前必做）

内容安全用于对社区发布的文字和图片做自动审核（UGC 合规）。
**原型阶段可跳过**，上线前需开通。

1. 前往 [腾讯云内容安全控制台](https://console.cloud.tencent.com/cms)
2. 分别开通 **TMS（文本内容安全）** 和 **IMS（图片内容安全）**
3. 创建一个**子账号**（最小权限：`QcloudTMSFullAccess` + `QcloudIMSFullAccess`），生成 SecretId 和 SecretKey
4. 在控制台 → 云函数 → `audit` 函数 → 「环境变量」中添加：
   - `CMS_SECRET_ID` = 子账号 SecretId
   - `CMS_SECRET_KEY` = 子账号 SecretKey
   - `CMS_REGION` = `ap-shanghai`（默认已配置）

> ⚠️ 不要把主账号密钥用于内容安全，创建最小权限子账号更安全。

---

## 4. 安装脚本依赖

进入项目目录，安装初始化脚本所需依赖：

```bash
cd /path/to/pawmemory-cloud/scripts
npm install
```

---

## 5. 初始化数据库

### 5.1 创建集合 + 建索引

```bash
cd /path/to/pawmemory-cloud/scripts

# 用你的腾讯云密钥（临时指定，不会存储到磁盘）
SECRETID=你的SecretId SECRETKEY=你的SecretKey node init-db.js
```

成功后看到 `🎉 数据库初始化完成！`

**或者**，如果你不想在命令行传密钥，可以先 `tcb login` 然后查阅 CLI 文档用 token 方式执行。

### 5.2 写入官方示例内容

```bash
SECRETID=你的SecretId SECRETKEY=你的SecretKey node seed-official.js
```

成功后看到 `🎉 官方示例内容写入完成！`，8 条示例动态已入库。

> **只需要跑一次。** 脚本内置幂等检查，重复跑不会写入重复数据。

---

## 6. 部署云函数

回到项目根目录：

```bash
cd /path/to/pawmemory-cloud
```

### 6.1 为每个云函数安装依赖

```bash
for fn in auth user pet memory post interact medical bill audit; do
  echo "Installing $fn..."
  cd functions/$fn && npm install && cd ../..
done
```

### 6.2 一键部署所有云函数

```bash
tcb fn deploy --all --envId pawmemory-d5gjmq8i444ffb334
```

等待约 2-5 分钟，每个函数部署完会显示 `✅ 成功`。

**或者按函数逐个部署**（如果某个函数报错，单独排查更方便）：

```bash
tcb fn deploy --name auth     --envId pawmemory-d5gjmq8i444ffb334
tcb fn deploy --name user     --envId pawmemory-d5gjmq8i444ffb334
tcb fn deploy --name pet      --envId pawmemory-d5gjmq8i444ffb334
tcb fn deploy --name memory   --envId pawmemory-d5gjmq8i444ffb334
tcb fn deploy --name post     --envId pawmemory-d5gjmq8i444ffb334
tcb fn deploy --name interact --envId pawmemory-d5gjmq8i444ffb334
tcb fn deploy --name medical  --envId pawmemory-d5gjmq8i444ffb334
tcb fn deploy --name bill     --envId pawmemory-d5gjmq8i444ffb334
tcb fn deploy --name audit    --envId pawmemory-d5gjmq8i444ffb334
```

---

## 7. 部署静态网站

```bash
cd /path/to/pawmemory-cloud

# 部署 static/ 目录到 CloudBase 静态托管
tcb hosting deploy static/ / --envId pawmemory-d5gjmq8i444ffb334
```

上传完成后看到 `✅ 部署成功`。

> 如果提示 「静态托管未开启」，先在控制台 → 「静态网站托管」中点击**开启**，再重新执行。

---

## 8. 访问你的应用

### 8.1 找到访问地址

控制台 → **「静态网站托管」** → 查看**默认域名**，格式为：

```
https://pawmemory-d5gjmq8i444ffb334-<APPID>.tcloudbaseapp.com
```

> 无需备案，该域名可直接访问。

### 8.2 测试登录

1. 打开上面的 URL
2. 输入任意 11 位手机号
3. 验证码输入 **`123456`**（原型期固定码，页面上有标注）
4. 点击「登录 / 注册」

首次登录会自动创建账号 + 一只默认宠物。

### 8.3 测试社区 Feed

登录后首页应能看到 8 条官方示例动态（汪汪日记、柴柴派对等）。

---

## 9. 常见问题排查

### Q: 登录时报错「云函数无返回」

**原因**：auth 云函数未部署，或部署失败。

**解决**：
```bash
tcb fn deploy --name auth --envId pawmemory-d5gjmq8i444ffb334
# 查看日志
tcb fn log --name auth --envId pawmemory-d5gjmq8i444ffb334
```

---

### Q: 登录后马上又跳回登录页

**原因**：各个云函数的 `TOKEN_SECRET` 环境变量不一致，导致 token 验证失败。

**解决**：确认 8 个函数（auth / user / pet / memory / post / interact / medical / bill）的 `TOKEN_SECRET` 完全相同。
检查命令：

```bash
tcb fn detail auth --envId pawmemory-d5gjmq8i444ffb334
```

### Q: 页面白屏 / 显示登录页但点击无效

**原因**：CloudBase JS SDK CDN 加载失败，或浏览器不支持。

**解决**：
1. 打开浏览器开发者工具（F12）→ Console，查看报错
2. 确认 CDN 地址可访问：`https://imgcache.qq.com/qcloud/cloudbase-js-sdk/1.3.5/cloudbase.full.js`
3. 换 Chrome/Edge 最新版浏览器

---

### Q: 发布动态后 Feed 不显示

**原因**：内容未通过审核（`auditStatus = 'reject'`），或 post 云函数报错。

**解决**：
1. 在控制台 → 云数据库 → `posts` 集合中查看最新一条数据的 `auditStatus` 字段
2. 如果是 `reject`，检查 audit 云函数的日志
3. 如果没有配置内容安全密钥，audit 函数应该默认放行（`pass: true`），请查看 audit 函数日志确认

---

### Q: 上传图片失败

**原因**：云存储权限不对，或 SDK 未获取到登录态。

**解决**：
1. 确认第 3.2 节的云存储权限已正确设置
2. 退出登录后重新登录，确保 CloudBase 登录态有效
3. 查看浏览器 Console 中 `[uploadToCloud]` 的报错信息

---

### Q: 初始化数据库脚本报错 `Invalid secretId`

**原因**：SecretId / SecretKey 填错了，或子账号权限不足。

**解决**：
1. 在 [访问管理](https://console.cloud.tencent.com/cam/capi) 中确认密钥是否有效
2. 子账号需要有 `QcloudTCBFullAccess` 权限

---

### Q: 体验版额度用尽

体验版配额（每月免费额度）：
- 云数据库：读 10 万次/月，写 10 万次/月
- 云存储：5 GB 空间，1 GB/月下行流量
- 云函数：1 万次/月调用

如果超额，控制台会发邮件提醒，可以按量付费或升级到基础版。

---

## 10. 后续维护

### 更新云函数代码

修改 `functions/<函数名>/index.js` 后：

```bash
tcb fn deploy --name <函数名> --envId pawmemory-d5gjmq8i444ffb334
```

### 更新前端

修改 `static/index.html` 后：

```bash
tcb hosting deploy static/ / --envId pawmemory-d5gjmq8i444ffb334
```

### 查看云函数日志

```bash
tcb fn log --name post --envId pawmemory-d5gjmq8i444ffb334 --limit 50
```

### 接入真实短信验证码

1. 在腾讯云控制台开通**短信服务（SMS）**
2. 修改 `functions/auth/index.js`，在 `sendCode` action 中替换为真实短信 SDK 调用：
   ```javascript
   const tencentcloud = require('tencentcloud-sdk-nodejs');
   // 参考 tencentcloud-sdk-nodejs 文档的 sms 模块
   ```
3. 同时取消 `sms_codes` 集合的使用逻辑（目前脚本已创建该集合备用）

### 数据备份

```bash
# 导出所有集合数据到本地
tcb db export --collection users --envId pawmemory-d5gjmq8i444ffb334
tcb db export --collection posts --envId pawmemory-d5gjmq8i444ffb334
# 以此类推其他集合
```

---

## 附：目录结构说明

```
pawmemory-cloud/
├── cloudbaserc.json          # CloudBase 项目配置（环境ID、函数列表、静态托管路径）
├── README.md                 # 本文档
├── SCHEMA.md                 # 数据库集合字段设计文档
├── DEPLOY.md                 # 部署信息备注
│
├── functions/                # 云函数（每个子目录对应一个函数）
│   ├── auth/                 # 登录鉴权（sendCode / login）
│   ├── user/                 # 用户资料（get / update）
│   ├── pet/                  # 宠物管理（list / create / update / delete）
│   ├── memory/               # 记忆银行（list / album / create / delete）
│   ├── post/                 # 社区动态（feed / create / detail / delete / myPosts）
│   ├── interact/             # 互动（like / follow / comment / followList）
│   ├── medical/              # 医疗记录（list / create / update / delete）
│   ├── bill/                 # 消费记账（list / create / delete / monthStat）
│   └── audit/                # 内容安全审核（check）
│
├── scripts/                  # 数据库初始化脚本
│   ├── package.json
│   ├── init-db.js            # 创建 10 个集合 + 索引
│   └── seed-official.js      # 写入 8 条官方示例内容
│
└── static/                   # 前端静态文件（部署到 CloudBase 静态托管）
    └── index.html            # 主页面（已改造：CloudBase SDK + 登录页 + 云端数据层）
```

---

*如有问题，查看 CloudBase 官方文档：https://docs.cloudbase.net*

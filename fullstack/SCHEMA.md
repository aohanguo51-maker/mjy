# 毛记忆 PawMemory —— CloudBase 数据模型设计

> 文档型数据库（MongoDB 风格），所有集合均带 `_id`（自动生成）

---

## 1. `users` —— 用户

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 自动 |
| `phone` | string | 手机号，唯一索引，登录凭证 |
| `name` | string | 昵称 |
| `avatarUrl` | string | 头像文件 fileID（云存储） |
| `avatarEmoji` | string | 未上传照片时用的 emoji 头像 |
| `avatarType` | string | `photo` \| `emoji` |
| `bio` | string | 个性签名 |
| `petYears` | number | 养宠年数 |
| `joinedAt` | Date | 注册时间 |
| `lastActiveAt` | Date | 最后活跃 |

索引：`phone`（唯一）

---

## 2. `pets` —— 宠物

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 自动 |
| `ownerId` | string | → users._id |
| `name` | string | 名字 |
| `emoji` | string | 展示用 emoji |
| `species` | string | 品种（橘猫/柯基犬…） |
| `kind` | string | `cat` \| `dog` \| `other`，用于素材匹配 |
| `birthday` | string | 生日 |
| `gender` | string | 公/母 |
| `neutered` | boolean | 是否绝育 |
| `weight` | string | 体重 |
| `avaBg` | string | 头像渐变色 |
| `dewormCycle` | string | 驱虫周期 |
| `allergies` | string | 过敏史 |
| `daily` | object | 今日日常 {food,water,poop,weight,state,mood} |
| `foodPrefs` | object | 饮食偏好 {brand,snack,allergy} |
| `isMemorial` | boolean | 是否已完成"最后的告别" |
| `createdAt` | Date | |

索引：`ownerId`

---

## 3. `memories` —— 记忆条目（记忆银行）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 自动 |
| `ownerId` | string | → users._id |
| `petId` | string | → pets._id |
| `type` | string | `photo` \| `audio` \| `text` \| `medical` \| `daily` \| `import` \| `farewell` |
| `icon` | string | 时间线图标 emoji |
| `title` | string | 标题 |
| `desc` | string | 描述正文 |
| `mood` | string | 心情标签（可选） |
| `fileIds` | array\<string\> | 云存储 fileID 列表（图片/音频） |
| `createdAt` | Date | |

索引：`ownerId + petId`、`createdAt`

---

## 4. `posts` —— 社区动态

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 自动 |
| `authorId` | string | → users._id；官方示例内容为 `"official"` |
| `authorName` | string | 冗余，避免每次 join |
| `authorAvatar` | string | 冗余 |
| `authorAvatarType` | string | |
| `isOfficial` | boolean | 官方示例内容标记 |
| `petId` | string | 关联宠物（可选） |
| `tag` | string | 话题标签 |
| `title` | string | |
| `content` | string | |
| `fileIds` | array | 图片 fileID |
| `imgUrl` | string | 官方内容用外链图 |
| `likeCount` | number | |
| `commentCount` | number | 冗余计数 |
| `createdAt` | Date | |
| `auditStatus` | string | `pending` \| `pass` \| `reject` 内容审核结果 |

索引：`createdAt`、`authorId`、`auditStatus`

---

## 5. `comments` —— 评论

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 自动 |
| `postId` | string | → posts._id |
| `userId` | string | → users._id |
| `userName` | string | 冗余 |
| `text` | string | |
| `createdAt` | Date | |
| `auditStatus` | string | 审核结果 |

索引：`postId`

---

## 6. `likes` —— 点赞关系

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 自动 |
| `userId` | string | |
| `postId` | string | |
| `createdAt` | Date | |

索引：`userId + postId`（唯一，防重复点赞）

---

## 7. `follows` —— 关注关系

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 自动 |
| `followerId` | string | 关注发起方 → users._id |
| `targetId` | string | 被关注方（users._id 或 `official` 账号 id） |
| `createdAt` | Date | |

索引：`followerId + targetId`（唯一）

---

## 8. `medical` —— 医疗记录

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 自动 |
| `ownerId` | string | |
| `petId` | string | |
| `date` | string | 就诊日期 |
| `title` | string | 小标题 |
| `badge` | string | 手术/疫苗/生病/体检 |
| `badgeClass` | string | 样式 class |
| `icon` | string | |
| `note` | string | 详细情况 |
| `fileIds` | array | 病历照片 |
| `createdAt` | Date | |

索引：`ownerId + petId`

---

## 9. `bills` —— 消费记账

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 自动 |
| `ownerId` | string | |
| `petId` | string | |
| `category` | string | food/toy/med/care/snack/other |
| `icon` | string | |
| `itemName` | string | 购买内容 |
| `amount` | number | 金额 |
| `date` | string | |
| `createdAt` | Date | |

索引：`ownerId`、`createdAt`

---

## 10. `sms_codes` —— 验证码（临时）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 自动 |
| `phone` | string | |
| `code` | string | 验证码 |
| `expiresAt` | Date | 过期时间（5分钟） |
| `used` | boolean | 是否已使用 |

> 原型期固定码 `123456`，接真实短信后此集合才真正启用

---

## 云存储目录规划

```
/avatars/{userId}/{timestamp}.jpg      头像
/memories/{userId}/{petId}/{ts}.jpg    记忆照片
/posts/{userId}/{ts}.jpg               社区动态配图
/medical/{userId}/{petId}/{ts}.jpg     病历照片
/audio/{userId}/{petId}/{ts}.webm      录音
```

---

## 官方示例内容

保留现有 8 条 Feed 作为官方内容，`authorId = "official"`、`isOfficial = true`，
所有用户可见，与真实用户内容混排。首次部署时通过 seed 脚本写入。

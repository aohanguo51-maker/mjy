# 毛记忆 PawMemory —— CloudBase 部署配置

## 环境信息
- **环境 ID**：`pawmemory-d5gjmq8i444ffb334`
- **地域**：上海
- **套餐**：云开发体验版（6个月免费，2026-07-29 开通）
- **数据库**：云数据库（文档型 / MongoDB 风格）
- **控制台**：https://console.cloud.tencent.com/tcb/env/index?envId=pawmemory-d5gjmq8i444ffb334

## 访问地址（部署后）
- 静态托管默认域名：`https://pawmemory-d5gjmq8i444ffb334-<APPID>.tcloudbaseapp.com`
  （具体域名在「静态网站托管」页查看，无需备案即可访问）

## 密钥
由用户本人保管，不入库、不写进代码。部署走用户本地 CLI 或临时子账号密钥。

## 待办
- [ ] 建 10 个数据集合 + 索引
- [ ] 写云函数（登录/用户/宠物/记忆/社区/上传/审核）
- [ ] seed 官方示例内容
- [ ] 前端改造：登录页 + 所有数据操作改调接口
- [ ] 接内容安全审核（UGC 合规必需）
- [ ] 部署静态托管 + 联调

## 到期提醒
体验版 2027-01-29 左右到期，到期前需续费或迁移，否则数据可能被清理。

## ⚠️ 部署前必做：同步前端最新改动

主文件 `/home/node/.openclaw/workspace/cowork/paw-memory-v2/index.html` 在 v1.0.36~v1.0.38 期间
新增了大量交互修复与功能，全栈版 `static/index.html` 尚未完全同步。

**部署前需要把这些改动搬过来**（注意保留全栈版特有的 callFn / esc / data-cloudsrc 机制）：

- 详情页可滚动、点赞可点、评论定位、关注二次点击跳主页（并关闭弹窗）
- 发布/头像上传照片修复（去掉 label 的 overflow:hidden，input 加 z-index:2）
- 换背景改自定义弹窗（去掉原生 confirm）
- 附近页宠物卡片跳账号主页、导航按钮 encodeURIComponent 修复
- 记忆银行：宠物切换栏加「＋添加」、三个统计数字可点、删重复邀请入口、最后的告别加 stopPropagation
- 发布标签改多选 + 扩充到 21 个
- 饮食偏好可编辑（自定义弹窗 #foodEditModal，不要用 prompt）
- 记忆详情页 #memoryDetailModal
- 首页 AI 生视频入口 + 小猫跳舞动画
- 真实猫叫/狗叫音频（mixkit CDN），按宠物种类匹配
- 专属叫声录制与确认弹窗 #customVoiceModal
- 示例 timeline 补全 type/audioUrl 字段（声音库、文字库依赖 type 过滤）

建议做法：以主文件为基线，重新叠加全栈版的云函数调用层，而不是逐条 patch。

'use strict';
/**
 * 云函数：seed —— 一次性写入官方示例内容（帖子 + 评论）
 * 在云端运行，自动拥有数据库权限，无需本地密钥
 * 调用：tcb fn invoke seed --envId pawmemory-d5gjmq8i444ffb334
 */
const tcb = require('@cloudbase/node-sdk');
const app = tcb.init({ env: process.env.TCB_ENV || 'pawmemory-d5gjmq8i444ffb334' });
const db = app.database();

const OFFICIAL_POSTS = [
  {
    authorId: 'official',
    authorName: '汪汪日记',
    authorAvatar: '',
    authorAvatarType: 'emoji',
    authorAvatarEmoji: '汪',
    isOfficial: true,
    petId: '',
    tag: '🐱 猫咪',
    title: '汪汪今天晒太阳晒到打呼噜',
    content: '中午十二点半，家里那个采光最好的飘窗永远是它的。趴了整整两个小时，肚皮都晒得暖乎乎的，摸上去像小暖炉。喊它吃饭都懒得睁眼，翻个身继续睡，属实是activated了"晒太阳模式"，谁来了都不好使。',
    fileIds: [],
    imgUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&q=80',
    likeCount: 12483,
    commentCount: 2,
    auditStatus: 'pass',
  },
  {
    authorId: 'official',
    authorName: '柴柴派对',
    authorAvatar: '',
    authorAvatarType: 'emoji',
    authorAvatarEmoji: '柴',
    isOfficial: true,
    petId: '',
    tag: '🐶 狗狗',
    title: '柴犬撞脸表情包本包了',
    content: '今天遛弯遇到一只金毛想跟它玩，它先是愣了三秒，然后突然炸毛跑开，回头看我的眼神写满了"你看到了吗它吓到我了"。柴犬的面瘫脸配上这种反差表情，每次都能笑死我，手机相册全是它的搞笑瞬间。',
    fileIds: [],
    imgUrl: 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600&q=80',
    likeCount: 8600,
    commentCount: 1,
    auditStatus: 'pass',
  },
  {
    authorId: 'official',
    authorName: '打工猫',
    authorAvatar: '',
    authorAvatarType: 'emoji',
    authorAvatarEmoji: '工',
    isOfficial: true,
    petId: '',
    tag: '🐱 猫咪',
    title: '加班到十点，它趴键盘上等我',
    content: '开了个远程会，它就那么趴在笔记本旁边，尾巴时不时扫过我的手，好像在说"别打了陪我"。写PPT写到崩溃的时候，摸它两下瞬间血压就降下来了，果然还是猫咪最懂打工人的委屈。',
    fileIds: [],
    imgUrl: 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600&q=80',
    likeCount: 3421,
    commentCount: 0,
    auditStatus: 'pass',
  },
  {
    authorId: 'official',
    authorName: '治愈系狗狗',
    authorAvatar: '',
    authorAvatarType: 'emoji',
    authorAvatarEmoji: '治',
    isOfficial: true,
    petId: '',
    tag: '🐶 狗狗',
    title: '金毛的眼神能治愈所有emo',
    content: '不知道为什么每次心情不好蹲在它旁边，它都会用那种湿漉漉的大眼睛看着你，脑袋轻轻蹭过来。金毛真的是自带情绪雷达的生物，什么话都不用说，光是看着就觉得世界还挺美好的。',
    fileIds: [],
    imgUrl: 'https://images.unsplash.com/photo-1552053831-71594a27632d?w=600&q=80',
    likeCount: 21300,
    commentCount: 1,
    auditStatus: 'pass',
  },
  {
    authorId: 'official',
    authorName: '棉花团团',
    authorAvatar: '',
    authorAvatarType: 'emoji',
    authorAvatarEmoji: '棉',
    isOfficial: true,
    petId: '',
    tag: '🐰 兔子',
    title: '兔兔耳朵超软手感绝了',
    content: '每次摸它的耳朵都要花上五分钟，软到不真实，像摸云朵一样。它一开始还会躲，摸习惯了现在会主动把耳朵凑过来蹭手心，垂耳兔的耳朵真的是养兔子最幸福的福利之一。',
    fileIds: [],
    imgUrl: 'https://images.unsplash.com/photo-1585110396000-c9ffd4e4b308?w=600&q=80',
    likeCount: 6700,
    commentCount: 0,
    auditStatus: 'pass',
  },
  {
    authorId: 'official',
    authorName: '圆滚滚',
    authorAvatar: '',
    authorAvatarType: 'emoji',
    authorAvatarEmoji: '圆',
    isOfficial: true,
    petId: '',
    tag: '🐹 仓鼠',
    title: '仓鼠团子圆到滚起来了',
    content: '最近喂多了点瓜子，它现在圆得像个球，走路都晃晃悠悠的，从滚轮上下来的时候差点没站稳。虽然知道该控制饮食了，但看它抱着瓜子啃得那么香，实在狠不下心。',
    fileIds: [],
    imgUrl: 'https://images.unsplash.com/photo-1425082661705-1834bfd09dca?w=600&q=80',
    likeCount: 4500,
    commentCount: 0,
    auditStatus: 'pass',
  },
  {
    authorId: 'official',
    authorName: '毛孩子生活馆',
    authorAvatar: '',
    authorAvatarType: 'emoji',
    authorAvatarEmoji: '🏪',
    isOfficial: true,
    petId: '',
    tag: '🏪 宠物店',
    title: '本周新品上架！冻干零食买二送一',
    content: '新进了几款鸡胸肉和鸭胸肉冻干，无添加无盐，适合肠胃敏感的猫狗。本周到店买冻干买二送一，铲屎官们可以来薅一波羊毛啦！店内还有免费称重服务，欢迎带你家宝贝来玩。',
    fileIds: [],
    imgUrl: 'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=600&q=80',
    likeCount: 126,
    commentCount: 1,
    auditStatus: 'pass',
  },
  {
    authorId: 'official',
    authorName: '喵汪严选',
    authorAvatar: '',
    authorAvatarType: 'emoji',
    authorAvatarEmoji: '🛍️',
    isOfficial: true,
    petId: '',
    tag: '🛍️ 宠物店',
    title: '会员日活动：美容券免费领',
    content: '本月会员日开启抽奖，到店消费满100即可参与抽奖，奖品有造型美容券、洗涤套装、领圈项圈等。还有新客专属优惠，欢迎带家里的毛孩子来店看看。',
    fileIds: [],
    imgUrl: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=600&q=80',
    likeCount: 88,
    commentCount: 0,
    auditStatus: 'pass',
  },
];
const OFFICIAL_COMMENTS = [
  { postIndex: 0, userId: 'system', userName: '橘猫铲屎官', text: '太真实了，我家的也是，晒太阳时喊十遍都不理你' },
  { postIndex: 0, userId: 'system', userName: '一只猫的日常', text: '求问飘窗垫子哪买的，看着好软' },
  { postIndex: 1, userId: 'system', userName: '柴系爱好者', text: '柴犬的表情包永远的神' },
  { postIndex: 3, userId: 'system', userName: '狗子的头号粉丝', text: '金毛的眼神杀真的没人能挡住' },
  { postIndex: 6, userId: 'system', userName: '橘猫小丘', text: '上周刚买过，家里猫吃得很香！' },
];

exports.main = async () => {
  const result = { posts: 0, comments: 0, errors: [] };
  try {
    // 幂等保护：已灌过就跳过，避免重复调用产生重复数据
    const exist = await db.collection('posts').where({ isOfficial: true }).limit(1).get();
    if (exist.data && exist.data.length > 0) {
      return { code: 0, data: { msg: '官方内容已存在，本次跳过', skipped: true } };
    }

    // 写入帖子，记录 原id → 新_id 的映射，供评论关联
    const idMap = {};
    for (const p of OFFICIAL_POSTS) {
      try {
        const doc = Object.assign({}, p);
        const originalId = doc.id || doc._id;
        delete doc.id; delete doc._id;
        doc.isOfficial = true;
        doc.auditStatus = 'pass';
        // 展示用的基数赞数：真实点赞在此基础上累加
        // 不这么做的话，用户点一下赞，likeCount 会被真实记录数覆盖成 1
        doc.baseLikeCount = typeof p.likeCount === 'number' ? p.likeCount : 0;
        doc.likeCount = doc.baseLikeCount;
        doc.createdAt = doc.createdAt ? new Date(doc.createdAt) : new Date();
        const r = await db.collection('posts').add(doc);
        if (originalId) idMap[originalId] = r.id;
        result.posts++;
      } catch (e) { result.errors.push('post: ' + e.message); }
    }

    // 写入评论，postId 换成真实的文档 id
    for (const cm of OFFICIAL_COMMENTS) {
      try {
        const doc = Object.assign({}, cm);
        if (doc.postId && idMap[doc.postId]) doc.postId = idMap[doc.postId];
        doc.auditStatus = 'pass';
        doc.createdAt = doc.createdAt ? new Date(doc.createdAt) : new Date();
        await db.collection('comments').add(doc);
        result.comments++;
      } catch (e) { result.errors.push('comment: ' + e.message); }
    }

    return { code: 0, data: result };
  } catch (err) {
    return { code: 500, msg: err.message, data: result };
  }
};

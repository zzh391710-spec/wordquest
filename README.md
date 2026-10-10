# WordQuest 单词闯关

一个在游戏里习得英语单词的网页游戏。四个游戏世界共用一套词库和记忆模型：答错的词会在之后的关卡里回来，直到记住为止。

纯 HTML / CSS / JavaScript，无需构建，可直接部署到 GitHub Pages，也可以本地双击 `index.html` 离线游玩。地牢模式的 3D 画面使用 three.js（已放在 `js/vendor/`，不依赖网络）；所有模型、贴图都用代码生成，没有外部素材文件。不支持 WebGL 的设备会自动切换成 2D 画面。

## 四个游戏模式

| 模式 | 玩法 | 主要训练 |
| --- | --- | --- |
| 🗡️ Lexicon Dungeon 地牢冒险（3D） | 第三人称 3D 地牢：勇者穿过火把照亮的走廊，6 个房间依次是普通怪、宝箱、精英怪、巨龙 Boss。每个单词都有一句发生在地牢里的句子，填出缺失的词才能出招；一局的句子按房间顺序连成一个小故事，结算页可以读到 | 语境填空（选词 / 拼写），难度随熟练度上升 |
| 🔍 Word Detective 侦探解谜 | 勘查现场解开被墨渍遮住的线索词，审问证人，最后用收集到的证据完成推理、指认凶手 | 语境理解、近义辨析 |
| ☕ Word Café 经营咖啡馆 | 顾客用英语点单，在耐心耗尽前给出正确的词；常客 = 复习词；小费可购买装饰 | 日常习惯、定义↔单词 |
| 🎧 Echo Runner 听力跑酷 | 听发音，切换到正确中文释义的跑道；每第 6 道门要求听写；速度随连击上升 | 听音辨义、听写 |

## 功能

- **用户体系**：注册（昵称、用户名、可选邮箱、密码）、登录（用户名或邮箱）、退出；修改昵称 / 邮箱 / 头像；修改密码；删除账号
- **账号信息**：注册时间、最近登录、登录次数、等级、经验、金币、连续天数、最佳连续天数、总局数
- **游戏记录**：每局保存模式、结果、得分、正确率、新词 / 复习词数、XP、金币、用时、摘要；支持按模式筛选和汇总统计
- **单词进度**：每个词的阶段（新词 / 学习中 / 复习中 / 已掌握）、正确率、下次复习时间
- **SM-2 间隔重复**：到期复习优先，新词按比例补充；复习积压过多时自动暂停新词
- **题型随熟练度升级**：识别（看词选义、看释义选词、听音选义）→ 回忆（看释义拼写、听音拼写）→ 运用（句子填空、句子拼写）
- **自适应难度**：根据最近 8 题正确率调整答题时间，目标正确率 75–85%
- **道具与商店**：提示卷轴、沙漏、凤凰羽毛
- **发音**：浏览器自带语音（Web Speech API），可选美音 / 英音和语速
- **备份**：导出 / 导入 JSON，可在设备间迁移进度（不含密码）

## 本地运行

```bash
# 方式一：直接双击 index.html

# 方式二：起一个本地服务器（推荐，行为和线上一致）
python3 -m http.server 8000
# 打开 http://localhost:8000
```

## 部署到 GitHub Pages

1. 新建仓库，把本目录所有文件推上去（`index.html` 放在仓库根目录）
2. 仓库 Settings → Pages → Source 选 `Deploy from a branch`，分支选 `main`，目录选 `/ (root)`
3. 保存后等一两分钟，访问 `https://<你的用户名>.github.io/<仓库名>/`

```bash
git init
git add .
git commit -m "WordQuest: first playable version"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

## 目录结构

```
index.html            入口，按顺序加载所有脚本
css/style.css         全部样式
js/
  core/
    util.js           工具函数、事件总线
    storage.js        localStorage 封装
    db.js             数据访问层（异步接口，可替换为后端）
    auth.js           注册、登录、账号管理、密码哈希
    srs.js            SM-2 间隔重复
    engine.js         选词、出题、判分、记录、结算
    audio.js          发音与音效
  data/words.js       词库（48 个高阶词，4 个主题）
  data/dungeon-story.js 地牢故事：每个词一句地牢里的句子、房间旁白、章节主题
  ui/
    kit.js            DOM 工具、表单、提示、路由
    question.js       通用题目组件、新词卡片
    game.js           模式注册表、游戏外壳、ctx 接口
  vendor/three.min.js three.js r149（MIT 许可，见 three.LICENSE）
  modes/
    dungeon3d.js      地牢 3D 场景：走廊、勇者、7 种怪物、动画、特效
    dungeon.js        地牢规则（3D / 2D 两种画面共用）
    detective.js · cafe.js · runner.js
  screens/            登录、主页、个人中心、结算页
  app.js              启动
```

## 架构

```
          ┌──────────── screens（登录 / 主页 / 个人中心 / 结算）
          │
modes ────┤  dungeon · detective · cafe · runner
          │        │  只负责“皮肤”和关卡规则
          │        ▼
          │   ctx（ui/game.js）：ask · intro · log · useItem · finish
          │        │
          ▼        ▼
       engine（选词、出题、判分、结算） ── srs（SM-2）
          │
         db（异步接口） ── storage（localStorage，可换成 Supabase 等）
```

新增一个模式只需要在 `js/modes/` 新建文件并注册：

```js
WQ.Modes.register({
  id: 'mymode',
  name: 'My Mode',
  icon: '🎯',
  tagline: 'One line describing the game.',
  sessionSize: (settings) => 10,          // 可选
  start: async (ctx) => {
    const panel = WQ.h('div');
    ctx.stage.replaceChildren(panel);
    for (const entry of ctx.entries) {
      await ctx.intro(panel, entry);       // 新词先展示
      const res = await ctx.ask(panel, entry, { timeLimit: 20 });
      // res.correct / res.ms / res.hinted ...
    }
    ctx.finish({ result: 'win', score: 100, coins: 10 });
  }
});
```

然后在 `index.html` 里加一行 `<script src="js/modes/mymode.js"></script>`，并在 `css/style.css` 的 `:root` 里加一个 `--mymode` 颜色。

## 数据模型

| 存储键 | 内容 |
| --- | --- |
| `users` | `{ [id]: { id, username, displayName, email, avatar, salt, passwordHash, createdAt, updatedAt, lastLoginAt, loginCount } }` |
| `session` | `{ userId, since }` |
| `profile:<id>` | `{ xp, coins, streak, bestStreak, lastPlayDate, totalSessions, inventory, cafeDecor, best, settings }` |
| `srs:<id>` | `{ [wordId]: { ef, interval, reps, due, seen, correct, wrong, lapses, last } }` |
| `records:<id>` | `[{ id, mode, startedAt, endedAt, durationSec, result, score, questions, correct, accuracy, xp, coins, newWords, reviewedWords, bestCombo, words, summary, detail }]` |

所有键都带 `wordquest:v1:` 前缀。

## 替换词库

编辑 `js/data/words.js` 里的 `RAW` 数组，每行格式：

```js
['word', 'adj.', '/fəˈnetɪk/', '中文释义', 'English definition', 'An example sentence containing word.', 'Theme', ['confusable1', 'confusable2']]
```

例句必须原样包含这个单词（用于生成填空题）；`confusables` 是形近 / 音近词，会作为干扰项出现。

## 关于账号安全

当前版本的账号保存在浏览器本地：密码用 PBKDF2-SHA256（12 万次迭代、随机盐）哈希后存储，不会明文保存。但这仍然是**本地账号**，不能防止有设备访问权限的人修改数据，也不能跨设备同步。

要做多设备同步或公开上线，把 `js/core/db.js` 换成真正的后端（例如 Supabase：`users` 用 Supabase Auth，`profile` / `srs` / `records` 各建一张表）。`db.js` 的接口已经是异步的，界面和游戏模式不需要改。

## 地牢里的故事是怎么拼出来的

- `js/data/dungeon-story.js` 给每个单词写了一句发生在地牢里的句子，并标注它最适合的房间：`gate`（进门）、`battle`（战斗）、`chest`（宝箱）、`elite`（精英守卫）、`boss`（巨龙）。句子里可以用 `{hero}`（玩家昵称）和 `{foe}`（当前房间的怪物）。
- 每局开始时，SRS 选出这局要练的词，再按房间"发牌"：进门先用 gate 句，宝箱房用 chest 句，巨龙房用 boss 句，不够时用战斗句补。
- 每道题都是这句话的填空：新词给出英文释义并选词，熟一些的词改为拼写，精英怪和巨龙必须拼写。
- 一局的句子按顺序存起来，结算页显示"Your tale"，并按这局单词的主要主题给章节起名（The Hall of Feelings / The Court Below / The Riddle Vault / The Shifting Halls），3D 场景里的旗帜和尘埃颜色也随主题变化。
- 换词库时，给新词在 `dungeon-story.js` 里补一句即可；没有写的词会退回用词典例句。

## 3D 地牢的结构

`dungeon3d.js` 对外只暴露几个动画方法，`dungeon.js` 通过它们驱动剧情，不关心画面细节：

| 方法 | 画面 |
| --- | --- |
| `openGate()` / `walkTo(i)` | 打开大门；勇者走到第 i 个房间，镜头跟随 |
| `heroAttack({ crit })` | 举剑、挥砍、法术飞向怪物，命中闪光和粒子 |
| `foeAttack()` | 怪物冲向勇者（巨龙改为喷火），屏幕震动和红色闪光 |
| `foeDie()` / `openChest()` | 怪物消散；宝箱打开、金币飞出 |
| `heroFall()` / `heroRevive()` / `victory()` | 倒地、凤凰羽毛复活、胜利举剑 |

要换模型或加新怪物，在 `BUILDERS` 里加一个函数，返回 `{ root, body, height, center, update(t) }`，再在 `dungeon.js` 的 `MONSTERS` 里引用它的 key。

## 后续可以做

- 词库导入（CSV / JSON 上传），支持多套词库切换
- Supabase 后端与跨设备同步
- 把侦探、咖啡馆、跑酷也做成 3D 场景（可复用 dungeon3d.js 的角色和特效）
- 地牢多层与更多 Boss，侦探多章节剧情
- 每日任务、成就徽章
- PWA（离线安装到手机桌面）

## 云端后端（AWS Amplify）

仓库根目录有 `amplify/` 文件夹时，Amplify 会在每次推送后自动创建/更新：

- 账号库（Cognito）：保存用户名 + 密码（密码由 AWS 加密保存，任何人包括管理员都看不到明文）
- 数据库（DynamoDB，3 张表）：`UserProfile`（注册信息 + 等级/金币/连续天数）、`WordProgress`（每个用户每个单词的学习进度）、`GameRecord`（每局游戏记录）

前端通过 `js/core/cloud.js` 自动切换：线上有 `amplify_outputs.json` 就用云端；本地双击 `index.html` 则继续使用浏览器本地存储。修改 `cloud-src/bridge.js` 后需运行 `npm run build:cloud` 重新生成 `js/vendor/amplify-bundle.js`。

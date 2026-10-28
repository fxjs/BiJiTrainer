# BiJiTrainer

六人比鸡休闲小游戏。规则与策略依据 [ThinkBiJi](../ThinkBiJi) 讲义，规划及实现说明见 [docs/PLAN.md](docs/PLAN.md)。

## 当前功能

- 一个登录入口：后端随机给出武侠人物名，骰子重新抽取，点击“开始游戏”即建立身份并登录。没有注册、邮箱、密码或邮件验证界面。
- 输入尚未隐退的原名号可以找回原记录；当前浏览器自动记住身份，刷新后继续。
- 自由摆牌、蒙特卡洛推荐、错因诊断、间隔复习错题本、对局统计。
- 对局记录与错题本保存在 Supabase，按人物 UUID 隔离；不读取、迁移或上传旧的本机游戏数据。
- 深色牌桌、滑动多选、整道换位及短时合成动效；大错题本每页最多渲染 20 手。
- 配牌页紧凑排列三道与操作区，手牌首行完整显示 9 张；手机横屏将三道并排，手牌与按钮使用整行宽度，避免左右分栏挤小牌面。道名与张数居中对齐，黄色落牌边框保留内边距，提示区上下居中；窄屏手牌按可用宽度缩小，移动箭头与操作按钮保留 44px 触控区域，不缩放整页。右上角提供“横屏全屏”及退出入口；浏览器允许时锁定横屏，不支持全屏或方向锁定时明确提示或引导手动横放手机。
- 结果页的“重摆这一手”和“下一手”常驻底部，复盘详情独立滚动，模拟说明按需展开；错题本、统计等浏览页面仍可自然滚动。
- 缓存式 Web Audio 触感音效、独立震动、落牌与最优反馈试听；后台及静音时取消未播音效并挂起音频设备。

## 名号规则与数据安全

后台 `character_pool` 初始包含 **100 个不重复的武侠人物名**。前端只获取一个候选，不内置或下载完整名号表。

- 预览名号保留 10 分钟；多个会话不会同时拿到同一个有效候选。
- 掷骰不消耗名号；首次确认进入后，该名号退出新用户可分配池，直到主动隐退。
- “切换名号”只退出当前设备，不删除原记录，也不会释放名号；输入原名号仍可回来。
- “隐退江湖（删除）”是独立的危险操作，必须再次点击“确认隐退”。成功后删除该人物全部对局记录与错题、退出所有设备的此人物身份，并让名号可被他人选取；不可恢复。
- 隐退返还同名的新 UUID，不复用原人物 UUID。旧设备绑定、旧候选或延迟到达的旧人物请求不能访问新人物的数据。
- 新设备或清除浏览器登录数据后，输入尚未隐退的已用原名号，可以重新绑定同一人物身份；隐退后的旧记录无法找回。同名被重新领取后，主动输入此名号恢复的是新人物，昵称弱凭证的访问边界不变。
- 名号用完时不会虚构新名字、追加数字或重复分配；仍可找回未隐退的已有名号。

**这是刻意简化的昵称凭证方案：知道名号的人就能访问该身份的记录，不具备密码级保护。名号和仓库中的种子列表不是秘密，仅适合非敏感游戏数据。** Supabase 匿名认证负责会话传输，人物 UUID 与后台成员关系负责数据归属，不能把 Supabase API 的匿名 Key 当作用户身份。

补充名号仅需管理员在后台插入尚未使用的真实人物名，例如：

```sql
insert into public.character_pool (name) values ('楚留香'), ('陆小凤');
```

## 结构

- `packages/core`：牌编码、牌型强度、摆法、倒水、喜牌与结算。
- `packages/solver`：胜率表、蒙特卡洛精排与错因诊断；求解在 Web Worker 中运行。
- `packages/audio`：按需合成并缓存纸面瞬态与柔和提示音，无音频素材下载。
- `apps/trainer`：Vite + Vue 3 + Pinia + UnoCSS 游戏界面。
- `supabase/migrations`：名号池、会话成员关系、对局数据、RLS 与事务 RPC。
- `supabase/tests/database`：分配、找回、隔离与事务行为回归。
- `scripts/tables`、`scripts/golden`：胜率表训练与 Python 对拍基准。

## Supabase 配置

### 1. 初始化数据库

在项目 **SQL Editor** 中按日期顺序各执行一次：

1. `supabase/migrations/20261027000000_account_training_data.sql`
2. `supabase/migrations/20261028000000_retire_character.sql`

已经执行第一份迁移的项目只需补执行第二份，不能重跑建表迁移。

也可以使用已授权并关联该项目的 Supabase CLI：

```bash
pnpm dlx supabase login
pnpm dlx supabase link --project-ref kombknykyixfljbffbtj
pnpm dlx supabase db push
```

登录凭据由 CLI 管理，不写入前端环境变量或仓库；本地项目关联信息位于已忽略的 `supabase/.temp`。后续可由已授权的 CLI 执行 SQL，无需反复打开 SQL Editor。若数据库直连不可用，可使用官方 Management API 的 HTTPS 通道：

```bash
pnpm dlx supabase db query --linked 'select version, name from supabase_migrations.schema_migrations order by version;'
pnpm dlx supabase db query --linked --file path/to/reviewed-operation.sql
```

通过 SQL 接口应用迁移时，迁移语句和对应的标准 `supabase_migrations.schema_migrations` 记录必须在同一事务提交；已有手工建库应先核对结构再补记基线，不能重跑初始化脚本。针对同一项目的 CLI 连库操作串行执行，避免初始化临时登录角色时发生竞争。此授权用于本机助手操作；GitHub Actions 不会自动获得本机凭据，持续集成的授权需另外配置。

`character_pool` 和 `character_sessions` 不允许客户端直接读写。`reserve_character`、`claim_character`、`restore_character`、`current_character`、`leave_character`、`retire_character` 提供受控的名号操作。对局数据按 `character_id` 保存，RLS 只允许会话访问当前绑定人物的数据。

一手对局和相应错题进度在同一事务保存；稳定重试键避免重复计数或把后来的复习进度回退。保存、清空、切换和隐退接口均核对捕获的身份，避免旧请求误操作新身份。隐退在同一事务删除人物数据、全部成员关系与旧 UUID，再返还新 UUID 的同名候选；任何一步失败都会回滚，前端保留原身份并显示错误，可重试。人物行锁让进行中的保存、清空和找回与隐退有确定先后，不锁其他设备的认证行，避免共享设备交叉等待。匿名认证用户被清理时，不会连带删除已用人物与对局记录；这与主动隐退不同。

**项目 Secret Key 不是数据库密码，也不能代替 Management API Access Token。** Pages 构建不会自动执行远程数据库迁移。

### 2. 开启匿名登录

在 Supabase **Authentication → Sign In / Providers → Anonymous Sign-ins** 中开启匿名登录。无需开启邮箱注册或邮箱确认。

本应用不使用邮箱、密码重置或 OAuth 跳转，前端不需要配置 JWKS URL。浏览器会持久化匿名会话；找回名号通过后台 RPC 完成，不依赖原设备的会话。

### 3. 配置前端

```bash
cp apps/trainer/.env.example apps/trainer/.env.local
pnpm install
pnpm dev
```

- `VITE_SUPABASE_URL`：项目 URL。
- `VITE_SUPABASE_PUBLISHABLE_KEY`：公开 Publishable Key；本地开发也支持 anon JWT。

示例文件已填入当前项目的公开信息。**所有 `VITE_` 变量都会进入浏览器产物，禁止放入 Secret Key、service-role key 或数据库密码。**

未配置服务、未启用匿名登录或未执行迁移时，页面会显示真实错误，不会伪造名号或退回本机存储并声称已经保存。断网保存失败时请保留页面并点击“重试保存”；成功前不能开始下一手或切换身份。未成功保存的结果不作离线持久化，关闭或刷新页面可能丢失。

音效、音量与震动偏好仅保存在当前浏览器，不随人物身份同步。

## 验证

```bash
pnpm test
pnpm --filter @biji/trainer typecheck
pnpm --filter @biji/trainer build
```

Vue 类型检查使用 TypeScript 6，避免 `vue-tsc` 与 TypeScript 7 编译器接口不兼容。

本地 Supabase 需要 Docker；配置已启用匿名认证并包含数据库迁移：

```bash
pnpm dlx supabase start --exclude studio,imgproxy,storage-api,realtime,edge-runtime,logflare,vector,supavisor
pnpm dlx supabase test db
pnpm dlx supabase status
```

API 为 `http://127.0.0.1:54331`，数据库端口 `54332`。把本地 API URL 与 `supabase status` 中的公开 Key 填入 `.env.local`，再重启开发服务器。不要使用状态输出中的 Secret Key。仅当确认是可丢弃的本地测试库时，才用 `pnpm dlx supabase db reset --local` 重建已有旧版本数据库。

数据库回归包括 `retire_character.test.sql` 的权限、删除、UUID 隔离、共享设备与末步失败回滚，以及 `retire_character_concurrency.test.sql` 的真实多连接保存／清空／找回／重复隐退竞争。并发测试需要 pgTAP 和 dblink 扩展，会提交隔离的测试 UUID／名号以便跨连接读取，并在用例前后清理；仅在可丢弃的本地测试库运行。

```bash
pnpm golden    # 重新生成 Python 对拍基准；需要 ../ThinkBiJi/sim 或 THINKBIJI_SIM
pnpm tables    # 重新训练胜率表
```

## 部署

先完成 Supabase 数据库初始化及匿名登录配置，再推送到 `main`。[部署工作流](.github/workflows/deploy-pages.yml) 会执行回归测试、类型检查和 Supabase 就绪检查，再构建发布 GitHub Pages：

<https://fxjs.github.io/BiJiTrainer/>

工作流默认使用当前项目的公开 URL 和 Publishable Key，可通过仓库 Actions Variables `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY` 覆盖。不需要也不应该为静态前端配置项目 Secret Key。

`scripts/deploy/check-backend.mjs` 会确认匿名登录已开启、人物接口已部署且拒绝未认证请求。后台未配置时工作流会失败，不会覆盖现有站点；配置完成后，在 Actions 重新运行工作流即可发布。

构建使用相对路径，可以部署到静态服务器的二级目录。策略求解仍在本地 Worker 进行，Supabase 不承担求解运算。

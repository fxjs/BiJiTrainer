# BiJiTrainer

六人比鸡配牌训练。规则与策略依据 [ThinkBiJi](../ThinkBiJi) 讲义，规划及实现说明见 [docs/PLAN.md](docs/PLAN.md)。

## 当前功能

- 一个登录入口：后端随机给出武侠人物名，骰子重新抽取，点击“进入训练”即建立身份并登录。没有注册、邮箱、密码或邮件验证界面。
- 输入原名号可以找回原记录；当前浏览器自动记住身份，刷新后继续。
- 自由练习、蒙特卡洛推荐、错因诊断、间隔复习错题本、训练统计。
- 练习记录与错题本保存在 Supabase，按人物 UUID 隔离；不读取、迁移或上传旧的本机训练数据。
- 深色牌桌、滑动多选、整道换位及短时合成动效；大错题本每页最多渲染 20 手。
- 缓存式 Web Audio 触感音效、独立震动、落牌与最优反馈试听；后台及静音时取消未播音效并挂起音频设备。

## 名号规则与数据安全

后台 `character_pool` 初始包含 **100 个不重复的武侠人物名**。前端只获取一个候选，不内置或下载完整名号表。

- 预览名号保留 10 分钟；多个会话不会同时拿到同一个有效候选。
- 掷骰不消耗名号；首次确认进入后，该名号永久退出新用户可分配池。
- 切换名号不删除原记录，也不会把已用名号重新放回池中。
- 新设备或清除浏览器登录数据后，输入已使用的原名号，可以重新绑定同一人物身份。
- 名号用完时不会虚构新名字、追加数字或重复分配；仍可找回已有名号。

**这是刻意简化的昵称凭证方案：知道名号的人就能访问该身份的记录，不具备密码级保护。名号和仓库中的种子列表不是秘密，仅适合非敏感训练数据。** Supabase 匿名认证负责会话传输，人物 UUID 与后台成员关系负责数据归属，不能把 Supabase API 的匿名 Key 当作用户身份。

补充名号仅需管理员在后台插入尚未使用的真实人物名，例如：

```sql
insert into public.character_pool (name) values ('楚留香'), ('陆小凤');
```

## 结构

- `packages/core`：牌编码、牌型强度、摆法、倒水、喜牌与结算。
- `packages/solver`：胜率表、蒙特卡洛精排与错因诊断；求解在 Web Worker 中运行。
- `packages/audio`：按需合成并缓存纸面瞬态与柔和提示音，无音频素材下载。
- `apps/trainer`：Vite + Vue 3 + Pinia + UnoCSS 训练界面。
- `supabase/migrations`：名号池、会话成员关系、训练数据、RLS 与事务 RPC。
- `supabase/tests/database`：分配、找回、隔离与事务行为回归。
- `scripts/tables`、`scripts/golden`：胜率表训练与 Python 对拍基准。

## Supabase 配置

### 1. 初始化数据库

在项目 **SQL Editor** 中执行一次：

`supabase/migrations/20261027000000_account_training_data.sql`

也可以使用已授权并关联该项目的 Supabase CLI：

```bash
pnpm dlx supabase login
pnpm dlx supabase link --project-ref kombknykyixfljbffbtj
pnpm dlx supabase db push
```

`character_pool` 和 `character_sessions` 不允许客户端直接读写。`reserve_character`、`claim_character`、`restore_character`、`current_character`、`leave_character` 提供受控的名号操作。训练数据按 `character_id` 保存，RLS 只允许会话访问当前绑定人物的数据。

一手练习和相应错题进度在同一事务保存；稳定重试键避免重复计数或把后来的复习进度回退。保存、清空和切换接口均核对捕获的身份，避免旧请求误操作新身份。匿名认证用户被清理时，不会连带删除已用人物与训练记录。

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

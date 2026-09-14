# Claude Code 开工模板包

> **写进记性的教训会复发，写进架构的教训才安息。**

我们用 Claude Code 从零开发并上线了两个 SaaS 产品，90 天里把每一次踩坑都记进数据库——共 **271 条**，每条都有根因、解决方案和预防措施。复盘时发现一个规律：

- 写在文档里的教训（"下次记得"）——**几乎必然复发**。「写数据库必须检查结果」这条我们白纸黑字写了 8 遍，犯了 8 次。
- 变成机器规则的教训（lint 报错、hook 拦截、测试变红）——**零复发**。

这个仓库就是把那 271 条教训里能机械化的部分，做成一个**开箱即用的项目模板**。新项目从它开始，第一天就带着我们 90 天踩出来的免疫力。

我们还把其中 5 条模式级发现提交给了 Anthropic 官方（可作为这套数据真实性的公开佐证）：
[#94168](https://github.com/anthropics/claude-code/issues/94168) ·
[#94169](https://github.com/anthropics/claude-code/issues/94169) ·
[#94170](https://github.com/anthropics/claude-code/issues/94170) ·
[#94171](https://github.com/anthropics/claude-code/issues/94171) ·
[#94172](https://github.com/anthropics/claude-code/issues/94172)

---

## 核心理念：拦截力谱系

判断一条经验是不是"机器规则"，标准只有一个：**违反它的时候，谁来拦截？**

| 层级 | 载体 | 拦截力 | 本仓库对应 |
|---|---|---|---|
| 提示层 | AGENTS.md | 无拦截，只影响 AI 倾向 | `AGENTS.md`（模板，保持一页） |
| 提示层+ | Skill | 时机准，仍可违反 | `.claude/skills/`（4 个流程 Skill） |
| 行为层 | 测试用例 | CI 变红 | `templates/tests/`（3 类测试样板） |
| 代码层 | lint / 模式检查 | 提交即拦 | `scripts/check-rules.mjs`（6 条规则） |
| 动作层 | hooks + 权限配置 | **物理拦截 AI 的动作** | `.claude/settings.json` + `.claude/hooks/` |
| 架构层 | 架构决策 | 错误路径不存在 | `docs/23-lessons.md` 里标注了哪些该做成架构 |

AGENTS.md 单独用 = 我们数据里的"必然复发"。它是必要的底座，但真正防住重复犯错的是下面五层。

## 快速开始

```bash
# 方式一：GitHub 上点 "Use this template" 建新仓库

# 方式二：clone 后作为新项目起点
git clone https://github.com/jane1030/claude-code-starter-kit my-new-product
cd my-new-product && rm -rf .git && git init

# 试一下规则检查（对当前目录扫描）
node scripts/check-rules.mjs

# 打开 Claude Code 开工——hooks 和权限配置会自动生效
claude
```

然后做三件事：

1. 把 `AGENTS.md` 里的占位符换成你的项目信息（10 分钟）
2. 把 `.github/workflows/guard.yml` 里的构建/测试命令换成你的技术栈
3. 开发中参照 `templates/tests/` 给每个新功能配对应测试

## 这个包里有什么

### 1. `.claude/settings.json` — 动作层拦截（最硬的一层）

- **每次都要问你**（逐次授权，AI 无法绕过）：`git push`、`gh pr merge`、`vercel --prod`、`npm publish`
- **直接禁止**：`supabase db push`（会重放本地迁移覆盖线上）、`git push --force`、`gh pr merge --auto`（无分支保护时等于直接上生产）、`rm -rf`
- **hook 兜底**：权限规则按命令前缀匹配，复合命令（`cd x && git push`）能绕过——`.claude/hooks/guard.sh` 按子串再拦一道

背后的事故：我们说"先本地验一下"，AI 已经把 PR 合进了生产——它把上次的授权当成了永久授权。这层配置让"信任问题"变成"做不到问题"。

### 2. `scripts/check-rules.mjs` — 代码层检查（零依赖，CI 直接跑）

| 规则 | 拦什么 | 背后的事故 |
|---|---|---|
| `db-write-unchecked` | 写数据库后不检查 error | 同一个错犯了 8 次：扣费白送、付款不到账，全程无日志 |
| `money-from-client` | 金额/价格从客户端参数读取 | 下单接口收客户端传的 cost——理论上任何人可零元购 |
| `secret-in-url` | 密钥拼进 URL | API key 进了日志和代理 |
| `empty-catch` | 空 catch 块吞错误 | 静默失败家族，271 条里的头号家族 |
| `dangerous-script` | 脚本里出现 db push / --auto merge | 见上 |
| `llm-index-align` | 疑似按数组下标对齐 LLM 批量返回（警告级） | 写进规范后仍犯 3 次的坑 |

误报可用行内注释豁免：`// rule-allow: db-write-unchecked 原因写这里`。

### 3. `.claude/skills/` — 4 个流程 Skill（在对的时机注入完整流程）

| Skill | 触发时机 | 来自哪条教训 |
|---|---|---|
| `kickoff-restate` | 动数据库/架构的任务开工前 | 一句"每个账号一个 workspace"差点引发数据库大手术 |
| `schema-review` | AI 交表设计时 | 一个字段两个含义、外键指错表、枚举漏值死循环 |
| `remove-feature` | 要删除/停用任何功能时 | 砍掉试用金，"付款秒到账"跟着消失 |
| `debug-env-first` | 遇到"诡异"问题时 | 四大环境骗局，每个都浪费过半天以上 |

### 4. `templates/tests/` — 3 类测试样板

- `form-keeps-input.spec.ts` — 表单被打回后，用户已填内容必须还在（React 19 会自动清空）
- `upload-large-file.spec.ts` — 用超过平台限额的大文件真实传一次（平台 4.5MB 硬顶，本地测不出）
- `llm-batch-malformed.test.ts` — LLM 批量返回乱序、漏答、多答时代码不崩不错位

### 5. `AGENTS.md` — 提示层模板

只保留两类内容：项目锁定决策（占位）+ 六条红线。刻意保持一页——AGENTS.md 越长，被上下文压缩稀释得越狠。

### 6. `docs/23-lessons.md` — 23 条经验全文

每条：一句话教训 + 落地规则 + 它在本仓库对应哪个机械化载体（或标注"只能靠流程和人"）。

## 三个诚实的说明

1. **不是所有经验都能机械化。**23 条里约 1/3 能变成纯机器规则（本仓库已做），1/3 变成 Skill（半机器），1/3 只能靠流程和人的关卡（UI 截图验收、真人走查、真实平台跑一轮）——后两类在 `docs/23-lessons.md` 里都有标注，别指望装个模板就全自动了。
2. **规则检查是启发式的。**`check-rules.mjs` 用模式匹配，会有误报漏报，它的定位是"廉价的第一道网"，不是精确的静态分析。误报请用 `rule-allow` 注释豁免并写明原因。
3. **模板默认按 Supabase + Vercel + TypeScript 技术栈写**（我们两个产品的栈）。换栈的话，权限清单和规则模式需要按你的危险命令改一轮——结构和思路是通用的。

## 延续这个循环

模板给你的是我们 271 条的免疫力，你自己项目的新坑要靠同一个循环消化：

**出坑 → 记录（根因+预防）→ 每月看一眼哪些教训在复发 → 复发的升级成机器规则（改进这个仓库）。**

欢迎把你踩到的新坑和新规则提 PR。

## License

MIT

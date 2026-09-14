#!/usr/bin/env node
/**
 * check-rules.mjs — 代码层机器规则（零依赖，Node 18+）
 *
 * 来源：271 条真实踩坑记录里复发最多、且能用模式匹配拦住的几类。
 * 定位：廉价的第一道网（启发式），不是精确静态分析。
 *
 * 用法：
 *   node scripts/check-rules.mjs [目录，默认当前目录]
 *   node scripts/check-rules.mjs --warn-only   # 只报告不置败（接入初期用）
 *
 * 豁免误报：在命中行或其上一行加注释，并写明原因：
 *   // rule-allow: db-write-unchecked 这里是只读 RPC，无副作用
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const args = process.argv.slice(2);
const ROOT = args.find((a) => !a.startsWith("-")) ?? ".";
const WARN_ONLY = args.includes("--warn-only");

const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", ".vercel", "templates"]);

/** 规则定义。severity: error = CI 置败, warn = 只提示 */
const RULES = [
  {
    id: "db-write-unchecked",
    severity: "error",
    why: "写库不检查结果 = 静默失败（271 条里复发 8 次：扣费白送、付款不到账，全程无日志）",
    // 命中「数据库写操作调用」后，向下 6 行内找不到对 error 的处理即报
    check(lines, i) {
      if (!/await\s+[\w.]+\.(insert|update|upsert|delete|rpc)\s*\(/.test(lines[i])) return false;
      const ahead = lines.slice(i, i + 7).join("\n");
      return !/\berror\b/.test(ahead) && !/\bthrow\b/.test(ahead);
    },
  },
  {
    id: "money-from-client",
    severity: "error",
    why: "金额/价格/额度从客户端读取 = 把定价权交给攻击者（真实审出过零元购与负数铸币）",
    check(lines, i) {
      return (
        /formData\.get\(\s*['"](cost|price|amount|credits?|quantity)['"]/.test(lines[i]) ||
        /(?:req\.body|body|payload|params)\s*\.\s*(cost|price|amount|credits?)\b/.test(lines[i])
      );
    },
  },
  {
    id: "secret-in-url",
    severity: "error",
    why: "密钥拼进 URL 会进日志和代理——一律走请求头",
    check(lines, i) {
      return /[?&](api_?key|apikey|token|secret|password)=/i.test(lines[i]);
    },
  },
  {
    id: "empty-catch",
    severity: "error",
    why: "空 catch 吞错误 = 静默失败家族（271 条里的头号家族）——至少记日志",
    check(lines, i) {
      return /catch\s*(\(\s*\w*\s*\))?\s*\{\s*\}/.test(lines[i]);
    },
  },
  {
    id: "llm-index-align",
    severity: "warn",
    why: "疑似按数组下标对齐 LLM 批量返回——正常响应永远是绿的，乱序/漏答时张冠李戴（写进规范后仍犯 3 次）。请改为按业务 ID 对齐",
    fileGate: /llm|openai|anthropic|deepseek|gemini|completion|generate/i,
    check(lines, i) {
      return /\.map\(\s*\(\s*\w+\s*,\s*(i|idx|index)\s*\)/.test(lines[i]) &&
             /result|response|output|answer|items?/i.test(lines[i]);
    },
  },
];

/** 扫描 package.json 脚本与 CI 配置里的危险命令 */
const SCRIPT_RULES = [
  { id: "dangerous-script", pattern: /supabase\s+db\s+push/, why: "db push 会按本地迁移重放、可能覆盖线上状态——迁移走直连逐条应用" },
  { id: "dangerous-script", pattern: /gh\s+pr\s+merge[^\n]*--auto/, why: "--auto 在无分支保护仓库会立即合并 = 直接上生产" },
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const findings = [];
for (const file of walk(ROOT)) {
  const ext = extname(file);
  const isCode = CODE_EXT.has(ext);
  const isScriptCfg = /package\.json$|\.ya?ml$|\.sh$/.test(file);
  if (!isCode && !isScriptCfg) continue;

  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  const lines = text.split("\n");

  if (isCode) {
    for (const rule of RULES) {
      if (rule.fileGate && !rule.fileGate.test(text)) continue;
      for (let i = 0; i < lines.length; i++) {
        if (!rule.check(lines, i)) continue;
        const allowHere = new RegExp(`rule-allow:\\s*${rule.id}`);
        if (allowHere.test(lines[i]) || (i > 0 && allowHere.test(lines[i - 1]))) continue;
        findings.push({ file, line: i + 1, ...rule });
      }
    }
  }
  if (isScriptCfg) {
    for (const rule of SCRIPT_RULES) {
      for (let i = 0; i < lines.length; i++) {
        if (rule.pattern.test(lines[i]) && !/rule-allow:\s*dangerous-script/.test(lines[i])) {
          findings.push({ file, line: i + 1, severity: "error", ...rule });
        }
      }
    }
  }
}

if (findings.length === 0) {
  console.log("check-rules ✓ 未发现违规");
  process.exit(0);
}

let errors = 0;
for (const f of findings) {
  const tag = f.severity === "error" ? "ERROR" : "WARN ";
  if (f.severity === "error") errors++;
  console.log(`${tag} [${f.id}] ${f.file}:${f.line}`);
  console.log(`      ${f.why}`);
}
console.log(`\ncheck-rules: ${errors} error(s), ${findings.length - errors} warning(s)`);
if (errors > 0 && !WARN_ONLY) {
  console.log("修复后再提交；确属误报时在该行或上一行加 `// rule-allow: <规则id> 原因`。");
  process.exit(1);
}

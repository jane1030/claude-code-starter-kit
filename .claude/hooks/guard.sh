#!/bin/bash
# guard.sh — 动作层拦截的兜底网（PreToolUse hook, matcher: Bash）
#
# 为什么在 settings.json 的 permissions 之外还需要它：
# 权限规则按「命令前缀」匹配，复合命令能绕过——
#   例:  cd apps && git push        （前缀是 cd，不是 git push）
#   例:  echo ok; supabase db push        （rule-allow: dangerous-script 注释示例）
# 本脚本对完整命令串做「子串」匹配，把同一批规则再拦一道。
#
# 约定：exit 2 = 拦截（stderr 会反馈给 Claude 说明原因）；exit 0 = 放行。

INPUT=$(cat)

# 从 hook 输入 JSON 里取出 command 字段（无 jq 依赖，用 python3）
CMD=$(printf '%s' "$INPUT" | python3 -c "
import json,sys
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('command', ''))
except Exception:
    print('')
" 2>/dev/null)

[ -z "$CMD" ] && exit 0

block() {
  echo "BLOCKED by .claude/hooks/guard.sh — $1" >&2
  echo "如确需执行：请向用户说明并获得本次明确授权后，由用户调整 hook 或亲自执行。" >&2
  exit 2
}

case "$CMD" in
  # ── 危险数据库操作：db push 会按本地迁移文件重放，可能覆盖线上状态
  *"supabase db push"*)          block "supabase db push 可能重放本地迁移覆盖线上库（教训：迁移走直连通道逐条应用）";; # rule-allow: dangerous-script 本行是拦截规则本身

  # ── 不可逆外向动作的强制逐次确认（复合命令兜底；简单命令已由 permissions.ask 覆盖）
  *"git push --force"*|*"git push -f "*) block "禁止强制推送（教训：会抹掉他人/线上历史）";;
  *"gh pr merge"*--auto*)        block "--auto 在无分支保护的仓库会立即合并 = 直接上生产（真实翻过车）";; # rule-allow: dangerous-script 本行是拦截规则本身

  # ── 破坏工作区的操作：有未提交改动时执行过一次 git stash，暂存了一大批实现
  *"git stash"*)                 block "禁止 git stash（教训：会把未提交的实现整批暂存丢失感知）——要基线请先 commit 或开 worktree";;
  *"git checkout ."*|*"git checkout -- ."*) block "禁止整树 checkout 丢弃改动——请逐文件操作并先向用户确认";;
  *"git reset --hard"*)          block "禁止 reset --hard 丢弃改动——请先向用户确认";;

  # ── 极端破坏
  *"rm -rf /"*|*"rm -rf ~"*)     block "拒绝执行";;
esac

exit 0

# NaughtyAgent 项目命令

set shell := ["bash", "-cu"]

NA_PORT := "31415"
NA_HOST := "http://127.0.0.1:" + NA_PORT

# 显示帮助
help:
    @echo "NaughtyAgent 项目命令"
    @echo ""
    @echo "  just build          构建项目"
    @echo "  just test           运行单元测试"
    @echo "  just status         Git 状态"
    @echo "  just log            Git 日志"
    @echo ""
    @echo "=== NA 测试命令（LLM 可用）==="
    @echo "  just na-health      检查 daemon 是否运行"
    @echo "  just na-start       启动 daemon"
    @echo "  just na-stop        停止 daemon"
    @echo "  just na-status      daemon 详细状态（内存/会话/运行时间）"
    @echo "  just na-send SID MSG    发送消息（流式 SSE）"
    @echo "  just na-send-sync SID MSG  发送消息（非流式）"
    @echo "  just na-quick MSG   一条龙测试（自动 daemon+会话+发消息）"
    @echo "  just na-sessions    列出所有会话"
    @echo "  just na-find-session  查找/创建会话"
    @echo "  just na-session-info SID  查看会话详情"
    @echo "  just na-delete-session SID  删除会话"
    @echo "  just na-log         查看最新项目日志"
    @echo "  just na-daemon-log  查看 daemon 日志"
    @echo "  just na-standalone MSG  独立模式（不需 daemon）"

# 构建项目
build:
    @pnpm -C packages/agent build

# 运行测试
test:
    @pnpm -C packages/agent test

# 显示 Git 状态
status:
    @git status -sb

# 显示 Git 日志
log:
    @git log --oneline -10

# ────────────────────────────────────────
# NA 测试命令
# ────────────────────────────────────────

# _json: 内部 helper，从 stdin 读 JSON 提取字段（Windows 兼容）
_json EXPR:
    @node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log({{EXPR}})}catch(e){console.error(d)}})"

# 检查 daemon 健康状态
na-health:
    @curl -sf {{NA_HOST}}/health 2>/dev/null && echo "" || echo '{"status":"unreachable","hint":"run: just na-start"}'

# 启动 daemon（后台）
na-start:
    @echo "启动 daemon..."
    @node packages/agent/dist/cli/cli.js daemon start
    @sleep 2
    @just na-health

# 停止 daemon
na-stop:
    @node packages/agent/dist/cli/cli.js daemon stop 2>/dev/null || echo "daemon 未运行"

# 列出所有会话
na-sessions:
    @curl -sf {{NA_HOST}}/sessions 2>/dev/null | just _json "j.sessions.map(s=>s.id+' | '+s.agentType+' | '+s.cwd).join('\\n')" || echo "daemon 未运行"

# 查找或创建会话（按 cwd）
na-find-session CWD=".":
    @curl -sf -X POST {{NA_HOST}}/sessions/find-or-create -H 'Content-Type: application/json' -d '{"cwd":"'$(realpath {{CWD}})'"}' | just _json "j.id"

# 发送消息（流式 SSE，实时输出）
na-send SESSION_ID MSG:
    #!/usr/bin/env bash
    curl -sfN -X POST {{NA_HOST}}/sessions/{{SESSION_ID}}/messages \
      -H 'Content-Type: application/json' \
      -H 'Accept: text/event-stream' \
      -d "{\"message\":\"$(echo '{{MSG}}' | sed 's/"/\\"/g')\",\"stream\":true}" \
    | node -e "
      const rl = require('readline').createInterface({ input: process.stdin });
      rl.on('line', line => {
        if (!line.startsWith('data: ')) return;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') { console.log('\\n--- DONE ---'); process.exit(0); }
        try {
          const e = JSON.parse(raw);
          switch (e.type) {
            case 'text_delta': process.stdout.write(e.delta || ''); break;
            case 'tool_start': console.log('\\n[tool] ' + e.name); break;
            case 'tool_end':   console.log(e.isError ? ' ERR' : ' ok'); break;
            case 'thinking':   process.stdout.write('.'); break;
            case 'thinking_end': console.log(''); break;
            case 'error':      console.log('ERROR: ' + e.message); break;
            case 'done':       if(e.usage) console.log('\\ntokens: in=' + e.usage.inputTokens + ' out=' + e.usage.outputTokens); break;
          }
        } catch {}
      });
    "

# 发送消息（非流式，等待完整响应）
na-send-sync SESSION_ID MSG:
    @curl -sf -X POST {{NA_HOST}}/sessions/{{SESSION_ID}}/messages \
      -H 'Content-Type: application/json' \
      -d "{\"message\":\"$(echo '{{MSG}}' | sed 's/"/\\"/g')\",\"stream\":false}" \
    | just _json "j.content||JSON.stringify(j,null,2)"

# 独立模式（不需要 daemon，单次执行完退出）
na-standalone MSG:
    @node packages/agent/dist/cli/cli.js --standalone "{{MSG}}"

# 查看最新项目日志（.naughty/logs/）
na-log LINES="50":
    @ls -t .naughty/logs/*.log 2>/dev/null | head -1 | xargs tail -n {{LINES}} 2>/dev/null || echo "没有日志文件"

# 查看 daemon 全局日志
na-daemon-log LINES="50":
    @tail -n {{LINES}} ~/.naughtyagent/daemon.log 2>/dev/null || echo "没有 daemon 日志"

# 查看指定会话的元数据
na-session-info SESSION_ID:
    @cat ~/.naughtyagent/sessions/{{SESSION_ID}}/meta.json 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log('ID: '+j.id);console.log('CWD: '+j.cwd);console.log('Agent: '+j.agentType);console.log('Messages: '+j.messageCount);console.log('Created: '+new Date(j.createdAt).toLocaleString());console.log('Updated: '+new Date(j.updatedAt).toLocaleString())})" || echo "会话不存在"

# 查看 daemon 详细状态（内存、会话数、运行时间）
na-status:
    @curl -sf {{NA_HOST}}/daemon/status | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log('PID: '+j.pid);console.log('Uptime: '+Math.round(j.uptime/60)+' min');console.log('Memory: '+j.memory+' MB');console.log('Sessions: '+j.sessions);console.log('Workers: '+j.workers.active+'/'+j.workers.total);console.log('Tasks: queued='+j.tasks.queued+' running='+j.tasks.running+' done='+j.tasks.completed)})" 2>/dev/null || echo "daemon 未运行"

# 删除指定会话
na-delete-session SESSION_ID:
    @curl -sf -X DELETE {{NA_HOST}}/sessions/{{SESSION_ID}} && echo "已删除 {{SESSION_ID}}" || echo "删除失败"

# 快速测试：确保 daemon 运行 + 创建会话 + 发消息（一条龙）
na-quick MSG:
    #!/usr/bin/env bash
    health=$(curl -sf {{NA_HOST}}/health 2>/dev/null)
    if [ -z "$health" ]; then
      echo "启动 daemon..."
      node packages/agent/dist/cli/cli.js daemon start
      sleep 3
    fi
    sid=$(curl -sf -X POST {{NA_HOST}}/sessions/find-or-create \
      -H 'Content-Type: application/json' \
      -d "{\"cwd\":\"$(pwd)\"}" \
    | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).id))")
    echo "Session: $sid"
    just na-send "$sid" "{{MSG}}"

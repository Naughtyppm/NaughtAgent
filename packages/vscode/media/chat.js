(function () {
  const vscode = acquireVsCodeApi();
  const messagesEl = document.getElementById('messages');
  const subheaderEl = document.getElementById('subheader');
  const inputEl = document.getElementById('input');
  const sendEl = document.getElementById('send');
  const clearEl = document.getElementById('clear');
  const cancelEl = document.getElementById('cancel');
  const newSessionEl = document.getElementById('newSession');
  const thinkingToggleEl = document.getElementById('thinkingToggle');
  const thinkingBudgetEl = document.getElementById('thinkingBudget');
  const agentTypeEl = document.getElementById('agentType');
  const modelSelectEl = document.getElementById('modelSelect');

  if (!messagesEl || !inputEl || !sendEl) {
    console.error('NaughtyAgent webview initialization failed: missing required elements');
    vscode.postMessage({ type: 'ready' });
    return;
  }

  let state = {
    messages: [],
    pending: false,
    thinkingEnabled: false,
    thinkingBudget: 16000,
    agentType: 'build',
    model: 'sonnet',
    runStatus: 'idle',
    sessionId: null,
    pendingQuestion: null,
  };
  const inputHistory = [];
  let inputHistoryIndex = -1;

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function roleName(role) {
    if (role === 'user') return '你';
    if (role === 'assistant') return 'AI';
    if (role === 'error') return '错误';
    return '系统';
  }

  function renderMarkdown(raw) {
    const escaped = escapeHtml(raw || '');
    return escaped
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  function render() {
    messagesEl.innerHTML = '';
    if (state.messages.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = '开始你的第一条消息';
      messagesEl.appendChild(empty);
    } else {
      for (const msg of state.messages) {
        const node = document.createElement('div');
        const kindClass = msg.kind ? ' ' + msg.kind : '';
        node.className = 'msg ' + msg.role + kindClass;
        const time = new Date(msg.timestamp).toLocaleTimeString();

        if (msg.kind === 'tool') {
          var lines = (msg.content || '').split('\n');
          var title = lines[0] || '工具调用';
          var body = lines.slice(1).join('\n').trim();
          if (body) {
            node.innerHTML =
              '<details class="tool-details"><summary>' +
              escapeHtml(title) +
              '</summary><div class="tool-body">' +
              escapeHtml(body) +
              '</div></details>';
          } else {
            node.innerHTML = '<div>' + escapeHtml(title) + '</div>';
          }
        } else if (msg.kind === 'thinking') {
          var thinkContent = escapeHtml(msg.content || '').replace(/\n/g, '<br>');
          node.innerHTML =
            '<details class="tool-details"><summary>💡 思考过程</summary><div class="tool-body">' +
            thinkContent +
            '</div></details>';
        } else if (msg.kind === 'status') {
          node.innerHTML = '<div>' + escapeHtml(msg.content) + '</div>';
        } else {
          var roleTitle = roleName(msg.role);
          node.innerHTML =
            '<div class="meta">' +
            roleTitle +
            ' · ' +
            time +
            '</div><div>' +
            renderMarkdown(msg.content) +
            '</div>';
        }
        messagesEl.appendChild(node);
      }
    }

    sendEl.disabled = state.pending;
    if (clearEl) clearEl.disabled = state.pending;
    if (cancelEl) cancelEl.disabled = !state.pending;
    if (thinkingToggleEl) thinkingToggleEl.checked = Boolean(state.thinkingEnabled);
    if (thinkingBudgetEl) {
      thinkingBudgetEl.value = String(state.thinkingBudget || 16000);
      thinkingBudgetEl.disabled = !state.thinkingEnabled || state.pending;
    }
    if (agentTypeEl) agentTypeEl.value = state.agentType || 'build';
    if (modelSelectEl) modelSelectEl.value = state.model || 'sonnet';
    if (agentTypeEl) agentTypeEl.disabled = state.pending;
    if (modelSelectEl) modelSelectEl.disabled = state.pending;
    const sid = state.sessionId ? state.sessionId : '-';
    if (subheaderEl) {
      subheaderEl.textContent =
        '模式: ' +
        state.agentType +
        ' · 模型: ' +
        state.model +
        ' · 状态: ' +
        state.runStatus +
        ' · 会话: ' +
        sid;
    }

    // 渲染 Question 工具弹窗
    if (state.pendingQuestion) {
      var q = state.pendingQuestion;
      var qDiv = document.createElement('div');
      qDiv.className = 'question-panel';
      qDiv.innerHTML = '<div class="question-message">' + escapeHtml(q.message) + '</div>';

      if (q.questionType === 'confirm') {
        var btnYes = document.createElement('button');
        btnYes.className = 'question-btn question-btn-primary';
        btnYes.textContent = '是';
        btnYes.onclick = function () {
          vscode.postMessage({ type: 'questionResponse', requestId: q.requestId, value: true });
        };
        var btnNo = document.createElement('button');
        btnNo.className = 'question-btn';
        btnNo.textContent = '否';
        btnNo.onclick = function () {
          vscode.postMessage({ type: 'questionResponse', requestId: q.requestId, value: false });
        };
        var btns = document.createElement('div');
        btns.className = 'question-actions';
        btns.appendChild(btnYes);
        btns.appendChild(btnNo);
        qDiv.appendChild(btns);
      } else if (q.questionType === 'select' && q.options) {
        var optDiv = document.createElement('div');
        optDiv.className = 'question-options';
        q.options.forEach(function (opt) {
          var btn = document.createElement('button');
          btn.className = 'question-option';
          btn.textContent = opt.label;
          if (opt.description) btn.title = opt.description;
          btn.onclick = function () {
            vscode.postMessage({ type: 'questionResponse', requestId: q.requestId, value: opt.value });
          };
          optDiv.appendChild(btn);
        });
        qDiv.appendChild(optDiv);
      } else {
        // text / multiselect fallback: 使用文本输入
        var qInput = document.createElement('textarea');
        qInput.className = 'question-input';
        qInput.placeholder = '输入回答...';
        if (q.default) qInput.value = String(q.default);
        var qSubmit = document.createElement('button');
        qSubmit.className = 'question-btn question-btn-primary';
        qSubmit.textContent = '发送';
        qSubmit.onclick = function () {
          vscode.postMessage({ type: 'questionResponse', requestId: q.requestId, value: qInput.value });
        };
        var qCancel = document.createElement('button');
        qCancel.className = 'question-btn';
        qCancel.textContent = '跳过';
        qCancel.onclick = function () {
          vscode.postMessage({ type: 'questionResponse', requestId: q.requestId, value: null, cancelled: true });
        };
        var qActions = document.createElement('div');
        qActions.className = 'question-actions';
        qActions.appendChild(qSubmit);
        qActions.appendChild(qCancel);
        qDiv.appendChild(qInput);
        qDiv.appendChild(qActions);
      }
      messagesEl.appendChild(qDiv);
    }

    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function updateThinkingSettings() {
    vscode.postMessage({
      type: 'updateThinking',
      enabled: thinkingToggleEl ? thinkingToggleEl.checked : false,
      budget: thinkingBudgetEl ? parseInt(thinkingBudgetEl.value, 10) : 16000,
    });
  }

  function updateRuntimeSettings() {
    vscode.postMessage({
      type: 'updateRuntime',
      agentType: agentTypeEl ? agentTypeEl.value : 'build',
      model: modelSelectEl ? modelSelectEl.value : 'sonnet',
    });
  }

  function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || state.pending) {
      return;
    }
    inputHistory.push(text);
    inputHistoryIndex = inputHistory.length;
    vscode.postMessage({ type: 'send', text: text });
    inputEl.value = '';
    inputEl.focus();
  }

  sendEl.addEventListener('click', sendMessage);
  if (clearEl)
    clearEl.addEventListener('click', function () {
      vscode.postMessage({ type: 'clear' });
    });
  if (cancelEl)
    cancelEl.addEventListener('click', function () {
      vscode.postMessage({ type: 'cancel' });
    });
  if (newSessionEl)
    newSessionEl.addEventListener('click', function () {
      vscode.postMessage({ type: 'newSession' });
    });
  if (thinkingToggleEl) thinkingToggleEl.addEventListener('change', updateThinkingSettings);
  if (thinkingBudgetEl) thinkingBudgetEl.addEventListener('change', updateThinkingSettings);
  if (agentTypeEl) agentTypeEl.addEventListener('change', updateRuntimeSettings);
  if (modelSelectEl) modelSelectEl.addEventListener('change', updateRuntimeSettings);
  inputEl.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      sendMessage();
      return;
    }

    if (e.key === 'ArrowUp' && !e.shiftKey) {
      if (inputHistory.length > 0) {
        e.preventDefault();
        inputHistoryIndex = Math.max(0, inputHistoryIndex - 1);
        inputEl.value = inputHistory[inputHistoryIndex] || '';
      }
      return;
    }

    if (e.key === 'ArrowDown' && !e.shiftKey) {
      if (inputHistory.length > 0) {
        e.preventDefault();
        inputHistoryIndex = Math.min(inputHistory.length, inputHistoryIndex + 1);
        if (inputHistoryIndex === inputHistory.length) {
          inputEl.value = '';
        } else {
          inputEl.value = inputHistory[inputHistoryIndex] || '';
        }
      }
    }
  });

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (data && data.type === 'state') {
      state = {
        messages: Array.isArray(data.messages) ? data.messages : [],
        pending: Boolean(data.pending),
        thinkingEnabled: Boolean(data.thinkingEnabled),
        thinkingBudget: Number(data.thinkingBudget || 16000),
        agentType: data.agentType || 'build',
        model: data.model || 'sonnet',
        runStatus: data.runStatus || 'idle',
        sessionId: data.sessionId || null,
        pendingQuestion: data.pendingQuestion || null,
      };
      render();
    }
  });

  vscode.postMessage({ type: 'ready' });
})();

(function () {
  var vscode = acquireVsCodeApi();
  var messagesEl = document.getElementById('messages');
  var subheaderInfoEl = document.getElementById('subheader-info');
  var usageBarEl = document.getElementById('usage-bar');
  var inputEl = document.getElementById('input');
  var sendEl = document.getElementById('send');
  var clearEl = document.getElementById('clear');
  var cancelEl = document.getElementById('cancel');
  var newSessionEl = document.getElementById('newSession');
  var thinkingToggleEl = document.getElementById('thinkingToggle');
  var thinkingBudgetEl = document.getElementById('thinkingBudget');
  var agentTypeEl = document.getElementById('agentType');
  var modelSelectEl = document.getElementById('modelSelect');
  var todoPanelEl = document.getElementById('todoPanel');
  var attachmentBarEl = document.getElementById('attachmentBar');
  var progressBarEl = document.getElementById('progressBar');
  var popupPanelEl = document.getElementById('popupPanel');
  if (!messagesEl || !inputEl || !sendEl) {
    console.error('NaughtyAgent webview init failed');
    vscode.postMessage({ type: 'ready' }); return;
  }
  var state = {
    messages: [], pending: false, thinkingEnabled: false, thinkingBudget: 16000,
    agentType: 'build', model: 'sonnet', runStatus: 'idle', sessionId: null,
    pendingQuestion: null, usage: null, todoList: null,
  };
  var inputHistory = [], inputHistoryIndex = -1, prevMessageCount = 0;
  var attachments = [];
  var popupActive = false, popupItems = [], popupSelectedIdx = 0, popupType = '';
  var userScrolledUp = false;

  // ── Auto-scroll: detect when user scrolls away from bottom ──
  messagesEl.addEventListener('scroll', function() {
    var atBottom = messagesEl.scrollTop + messagesEl.clientHeight >= messagesEl.scrollHeight - 60;
    userScrolledUp = !atBottom;
  });

  // ── Helpers ──
  function escapeHtml(t) {
    return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function roleName(r) {
    return r==='user'?'你':r==='assistant'?'AI':r==='error'?'错误':'系统';
  }
  function formatTokens(n) {
    if (!n||n===0) return '0';
    return n<1000?String(n):(n/1000).toFixed(1)+'K';
  }

  // ── Enhanced Markdown ──
  var cbId = 0;
  function renderInline(esc) {
    return esc
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,'<em>$1</em>')
      .replace(/`([^`]+)`/g,'<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a class="md-link" href="$2" title="$2">$1</a>');
  }
  function renderCodeBlock(lang, code) {
    var id = 'cb-'+(cbId++);
    var hdr = lang ? escapeHtml(lang) : 'code';
    return '<div class="code-block-wrapper">'
      +'<div class="code-block-header"><span>'+hdr+'</span>'
      +'<button class="code-block-copy" data-cbid="'+id+'">复制</button></div>'
      +'<pre class="code-block"><code id="'+id+'">'+escapeHtml(code.replace(/\n$/,''))+'</code></pre></div>';
  }
  function renderTable(rows) {
    if (!rows.length) return '';
    var h='<table>';
    for (var i=0;i<rows.length;i++) {
      var cells=rows[i].replace(/^\||\|$/g,'').split('|');
      var tag=i===0?'th':'td';
      h+='<tr>';
      for (var j=0;j<cells.length;j++) h+='<'+tag+'>'+renderInline(escapeHtml(cells[j].trim()))+'</'+tag+'>';
      h+='</tr>';
    }
    return h+'</table>';
  }

  function renderMarkdown(raw) {
    if (!raw) return '';
    var codeBlocks = [];
    var text = raw.replace(/```(\w*)\n([\s\S]*?)```/g, function(m,lang,code) {
      var idx = codeBlocks.length;
      codeBlocks.push({lang:lang,code:code});
      return '\n%%CB_'+idx+'%%\n';
    });
    var lines = text.split('\n'), html = '';
    var inList = false, listType = '', inTable = false, tableRows = [];
    for (var i=0; i<lines.length; i++) {
      var line = lines[i];
      var cbm = line.match(/^%%CB_(\d+)%%$/);
      if (cbm) {
        if (inList) { html+='</'+listType+'>'; inList=false; }
        if (inTable) { html+=renderTable(tableRows); inTable=false; tableRows=[]; }
        html += renderCodeBlock(codeBlocks[parseInt(cbm[1])].lang, codeBlocks[parseInt(cbm[1])].code);
        continue;
      }
      if (/^\|.*\|$/.test(line)) {
        if (inList) { html+='</'+listType+'>'; inList=false; }
        if (!inTable) inTable=true;
        if (!/^\|[\s\-:]+\|$/.test(line)) tableRows.push(line);
        continue;
      } else if (inTable) { html+=renderTable(tableRows); inTable=false; tableRows=[]; }
      var bqm = line.match(/^>\s?(.*)$/);
      if (bqm) {
        if (inList) { html+='</'+listType+'>'; inList=false; }
        html+='<blockquote>'+renderInline(escapeHtml(bqm[1]))+'</blockquote>'; continue;
      }
      if (/^### /.test(line)) { if(inList){html+='</'+listType+'>';inList=false;} html+='<h4>'+renderInline(escapeHtml(line.slice(4)))+'</h4>'; continue; }
      if (/^## /.test(line))  { if(inList){html+='</'+listType+'>';inList=false;} html+='<h3>'+renderInline(escapeHtml(line.slice(3)))+'</h3>'; continue; }
      if (/^# /.test(line))   { if(inList){html+='</'+listType+'>';inList=false;} html+='<h2>'+renderInline(escapeHtml(line.slice(2)))+'</h2>'; continue; }
      if (/^---+$/.test(line)) { if(inList){html+='</'+listType+'>';inList=false;} html+='<hr>'; continue; }
      var ulm = line.match(/^[\-\*] (.+)/);
      if (ulm) {
        if (!inList||listType!=='ul') { if(inList)html+='</'+listType+'>'; html+='<ul>'; inList=true; listType='ul'; }
        html+='<li>'+renderInline(escapeHtml(ulm[1]))+'</li>'; continue;
      }
      var olm = line.match(/^\d+\. (.+)/);
      if (olm) {
        if (!inList||listType!=='ol') { if(inList)html+='</'+listType+'>'; html+='<ol>'; inList=true; listType='ol'; }
        html+='<li>'+renderInline(escapeHtml(olm[1]))+'</li>'; continue;
      }
      if (inList) { html+='</'+listType+'>'; inList=false; }
      if (line.trim()==='') { html+='<br>'; continue; }
      html += renderInline(escapeHtml(line))+'<br>';
    }
    if (inList) html+='</'+listType+'>';
    if (inTable) html+=renderTable(tableRows);
    return html;
  }

  // ── Format tool input/output for readability ──
  function formatToolBody(body) {
    if (!body) return '';
    var lines = body.split('\n');
    var parts = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      // 输入行：尝试解析 JSON 并格式化
      if (line.indexOf('输入:') === 0 || line.indexOf('输入: ') === 0) {
        var jsonStr = line.replace(/^输入:\s*/, '');
        try {
          var obj = JSON.parse(jsonStr);
          var kvParts = [];
          for (var k in obj) {
            if (obj.hasOwnProperty(k)) {
              var v = obj[k];
              var valStr = typeof v === 'string' ? v : JSON.stringify(v);
              // 截断过长的值
              if (valStr.length > 120) valStr = valStr.substring(0, 117) + '...';
              kvParts.push('<span class="tool-param-key">' + escapeHtml(k) + '</span>: <span class="tool-param-val">' + escapeHtml(valStr) + '</span>');
            }
          }
          parts.push('<div class="tool-input-box">' + kvParts.join('<br>') + '</div>');
        } catch(e) {
          // JSON 解析失败，按原样显示
          parts.push('<div class="tool-input-box">' + escapeHtml(jsonStr) + '</div>');
        }
      }
      // 输出行
      else if (line.indexOf('输出:') === 0 || line.indexOf('输出: ') === 0) {
        var outContent = line.replace(/^输出:\s*/, '');
        // 输出可能很长，截断
        if (outContent.length > 500) outContent = outContent.substring(0, 497) + '...';
        parts.push('<div class="tool-output-box">' + escapeHtml(outContent) + '</div>');
      }
      // 后续输出行（多行输出）
      else if (parts.length > 0 && line.trim()) {
        var lastPart = parts[parts.length - 1];
        if (lastPart.indexOf('tool-output-box') !== -1) {
          // 追加到最后一个输出 box
          parts[parts.length - 1] = lastPart.replace('</div>', '<br>' + escapeHtml(line) + '</div>');
        } else {
          parts.push('<div class="tool-output-box">' + escapeHtml(line) + '</div>');
        }
      }
    }
    return parts.join('');
  }
  // ── Build message DOM node ──
  function extractFilePath(text) {
    // 从 JSON 输入或纯文本中提取文件路径
    // 匹配形如 "filePath":"xxx" 或 filePath: xxx 或 path: xxx
    var m = text.match(/(?:filePath|path|file)["\s]*[:=]\s*["']?([A-Za-z]:\\[^\s"'\n]+|\/[^\s"'\n]+)/i);
    return m ? m[1] : null;
  }
  function buildMsgNode(msg, isLast) {
    var node = document.createElement('div');
    var kindClass = msg.kind ? ' '+msg.kind : '';
    node.className = 'msg '+msg.role+kindClass;
    var time = new Date(msg.timestamp).toLocaleTimeString();
    if (msg.kind === 'tool') {
      var tlines = (msg.content||'').split('\n');
      var title = tlines[0]||'工具调用';
      var body = tlines.slice(1).join('\n').trim();
      var filePath = extractFilePath(msg.content||'');
      var fileLink = '';
      if (filePath) {
        var fileName = filePath.split(/[\\/]/).pop();
        fileLink = ' <span class="tool-file-link" data-file="'+escapeHtml(filePath)+'" title="'+escapeHtml(filePath)+'">📄 '+escapeHtml(fileName)+'</span>';
      }
      var formattedBody = formatToolBody(body);
      if (formattedBody) {
        node.innerHTML = '<details class="tool-details"><summary>'+escapeHtml(title)+fileLink
          +'</summary><div class="tool-body">'+formattedBody+'</div></details>';
      } else if (body) {
        node.innerHTML = '<details class="tool-details"><summary>'+escapeHtml(title)+fileLink
          +'</summary><div class="tool-body">'+escapeHtml(body)+'</div></details>';
      } else {
        node.innerHTML = '<div>'+escapeHtml(title)+fileLink+'</div>';
      }
    } else if (msg.kind === 'thinking') {
      node.innerHTML = '<details class="tool-details"><summary>💡 思考过程</summary><div class="tool-body">'
        +escapeHtml(msg.content||'').replace(/\n/g,'<br>')+'</div></details>';
    } else if (msg.kind === 'status') {
      node.innerHTML = '<div>'+escapeHtml(msg.content)+'</div>';
    } else {
      var content = renderMarkdown(msg.content);
      if (isLast && state.pending && msg.role==='assistant') content += '<span class="typing-cursor"></span>';
      node.innerHTML = '<div class="meta">'+roleName(msg.role)+' · '+time+'</div><div>'+content+'</div>';
    }
    return node;
  }

  // ── Main render ──
  function render() {
    var msgs = state.messages;
    var shouldScroll = !userScrolledUp;
    if (msgs.length === 0) {
      messagesEl.innerHTML = '<div class="empty">开始你的第一条消息</div>';
      prevMessageCount = 0;
    } else if (msgs.length < prevMessageCount) {
      messagesEl.innerHTML = '';
      for (var i=0;i<msgs.length;i++) messagesEl.appendChild(buildMsgNode(msgs[i],i===msgs.length-1));
      prevMessageCount = msgs.length;
    } else {
      if (prevMessageCount>0 && msgs.length>=prevMessageCount) {
        var lastIdx = prevMessageCount-1;
        var existing = messagesEl.children[lastIdx];
        if (existing) {
          // 保存当前 <details> 展开状态
          var oldDetails = existing.querySelectorAll('details');
          var openStates = [];
          for (var di=0; di<oldDetails.length; di++) openStates.push(oldDetails[di].open);
          var nn=buildMsgNode(msgs[lastIdx],lastIdx===msgs.length-1);
          existing.innerHTML=nn.innerHTML; existing.className=nn.className;
          // 恢复 <details> 展开状态
          var newDetails = existing.querySelectorAll('details');
          for (var ri=0; ri<newDetails.length && ri<openStates.length; ri++) {
            if (openStates[ri]) newDetails[ri].open = true;
          }
        }
      }
      for (var j=prevMessageCount;j<msgs.length;j++) {
        var emp=messagesEl.querySelector('.empty'); if(emp)emp.remove();
        messagesEl.appendChild(buildMsgNode(msgs[j],j===msgs.length-1));
      }
      prevMessageCount = msgs.length;
    }
    // Question panel
    var existingQ = messagesEl.querySelector('.question-panel');
    if (existingQ) existingQ.remove();
    if (state.pendingQuestion) renderQuestion(state.pendingQuestion);
    if (shouldScroll) messagesEl.scrollTop = messagesEl.scrollHeight;
    // Controls
    sendEl.disabled = state.pending;
    if (clearEl) clearEl.disabled = state.pending;
    if (cancelEl) cancelEl.disabled = !state.pending;
    if (thinkingToggleEl) thinkingToggleEl.checked = Boolean(state.thinkingEnabled);
    if (thinkingBudgetEl) { thinkingBudgetEl.value=String(state.thinkingBudget||16000); thinkingBudgetEl.disabled=!state.thinkingEnabled||state.pending; }
    if (agentTypeEl) { agentTypeEl.value=state.agentType||'build'; agentTypeEl.disabled=state.pending; }
    if (modelSelectEl) { modelSelectEl.value=state.model||'sonnet'; modelSelectEl.disabled=state.pending; }
    var sid = state.sessionId ? state.sessionId.slice(0,8) : '-';
    if (subheaderInfoEl) subheaderInfoEl.textContent = state.agentType+' · '+state.model+' · '+state.runStatus+' · '+sid;
    if (usageBarEl && state.usage) {
      var u=state.usage;
      usageBarEl.innerHTML='↑'+formatTokens(u.totalInput)+' ↓'+formatTokens(u.totalOutput)+' · '+(u.requestCount||0)+'次';
    }
    // Progress bar
    if (progressBarEl) {
      if (state.pending) progressBarEl.classList.add('active');
      else progressBarEl.classList.remove('active');
    }
    renderTodoList();
  }

  // ── Question panel ──
  // 统一交互：所有类型都显示 选项按钮 + 自由输入框
  function renderQuestion(q) {
    var qDiv=document.createElement('div'); qDiv.className='question-panel';
    qDiv.innerHTML='<div class="question-message">'+escapeHtml(q.message)+'</div>';

    // 选项区域（confirm/select/multiselect 都渲染为按钮）
    if (q.questionType==='confirm') {
      var od=document.createElement('div'); od.className='question-options';
      var by=document.createElement('button'); by.className='question-option question-option-primary'; by.textContent='是';
      by.onclick=function(){vscode.postMessage({type:'questionResponse',requestId:q.requestId,value:true});};
      var bn=document.createElement('button'); bn.className='question-option'; bn.textContent='否';
      bn.onclick=function(){vscode.postMessage({type:'questionResponse',requestId:q.requestId,value:false});};
      od.appendChild(by); od.appendChild(bn); qDiv.appendChild(od);
    } else if ((q.questionType==='select' || q.questionType==='multiselect') && q.options) {
      var od=document.createElement('div'); od.className='question-options';
      if (q.questionType==='multiselect') {
        // 多选：复选框模式
        var selected=new Set();
        q.options.forEach(function(opt){
          var btn=document.createElement('button'); btn.className='question-option'; btn.textContent=opt.label;
          if(opt.description) btn.title=opt.description;
          btn.onclick=function(){
            if(selected.has(opt.value)){selected.delete(opt.value);btn.classList.remove('question-option-selected');}
            else{selected.add(opt.value);btn.classList.add('question-option-selected');}
          };
          od.appendChild(btn);
        });
        qDiv.appendChild(od);
        // 多选确认按钮
        var msBtns=document.createElement('div'); msBtns.className='question-actions';
        var msOk=document.createElement('button'); msOk.className='question-btn question-btn-primary'; msOk.textContent='确认选择';
        msOk.onclick=function(){vscode.postMessage({type:'questionResponse',requestId:q.requestId,value:Array.from(selected)});};
        msBtns.appendChild(msOk); qDiv.appendChild(msBtns);
      } else {
        // 单选：点击即提交
        q.options.forEach(function(opt){
          var btn=document.createElement('button'); btn.className='question-option'; btn.textContent=opt.label;
          if(opt.description) btn.title=opt.description;
          btn.onclick=function(){vscode.postMessage({type:'questionResponse',requestId:q.requestId,value:opt.value});};
          od.appendChild(btn);
        });
        qDiv.appendChild(od);
      }
    }

    // 自由输入区域（所有类型都有）
    var fr=document.createElement('div'); fr.className='question-free-input';
    var fi=document.createElement('input'); fi.type='text'; fi.className='question-input-inline';
    fi.placeholder='或输入自定义回答...';
    if(q.default && q.questionType==='text') fi.value=String(q.default);
    var fs=document.createElement('button'); fs.className='question-btn question-btn-primary'; fs.textContent='发送';
    fs.onclick=function(){var v=fi.value.trim();if(v)vscode.postMessage({type:'questionResponse',requestId:q.requestId,value:v});};
    fi.addEventListener('keydown',function(e){if(e.key==='Enter'){var v=fi.value.trim();if(v)vscode.postMessage({type:'questionResponse',requestId:q.requestId,value:v});}});
    fr.appendChild(fi); fr.appendChild(fs); qDiv.appendChild(fr);

    messagesEl.appendChild(qDiv);
  }
  // ── TodoList ──
  function renderTodoList() {
    if (!todoPanelEl) return;
    var list=state.todoList;
    if (!list||list.length===0) { todoPanelEl.style.display='none'; return; }
    todoPanelEl.style.display='';
    var done=list.filter(function(t){return t.status==='done';}).length;
    var h='<div class="todo-panel-header"><span>待办 ('+done+'/'+list.length+')</span></div>';
    for (var i=0;i<list.length;i++) {
      var t=list[i], icon=t.status==='done'?'✅':t.status==='in_progress'?'🔄':'⬜';
      h+='<div class="todo-item '+t.status+'"><span class="todo-icon">'+icon+'</span>'+escapeHtml(t.title)+'</div>';
    }
    todoPanelEl.innerHTML=h;
  }

  // ── Attachments ──
  function renderAttachments() {
    if (!attachmentBarEl) return;
    attachmentBarEl.innerHTML='';
    for (var i=0;i<attachments.length;i++) {
      (function(idx){
        var item=document.createElement('div'); item.className='attachment-item';
        var img=document.createElement('img');
        img.src='data:'+attachments[idx].mimeType+';base64,'+attachments[idx].data;
        item.appendChild(img);
        var rm=document.createElement('button'); rm.className='attachment-remove'; rm.textContent='×';
        rm.onclick=function(){attachments.splice(idx,1);renderAttachments();};
        item.appendChild(rm); attachmentBarEl.appendChild(item);
      })(i);
    }
  }
  function addImageAttachment(file) {
    var reader=new FileReader();
    reader.onload=function(e){
      attachments.push({type:'image',data:e.target.result.split(',')[1],mimeType:file.type||'image/png'});
      renderAttachments();
    };
    reader.readAsDataURL(file);
  }
  // Drag & drop
  var footerEl=inputEl.parentElement;
  if (footerEl) {
    footerEl.addEventListener('dragover',function(e){e.preventDefault();footerEl.classList.add('drop-zone-active');});
    footerEl.addEventListener('dragleave',function(){footerEl.classList.remove('drop-zone-active');});
    footerEl.addEventListener('drop',function(e){
      e.preventDefault(); footerEl.classList.remove('drop-zone-active');
      if(e.dataTransfer&&e.dataTransfer.files) for(var i=0;i<e.dataTransfer.files.length;i++){
        var f=e.dataTransfer.files[i]; if(f.type.startsWith('image/'))addImageAttachment(f);
      }
    });
  }
  // Paste image
  inputEl.addEventListener('paste',function(e){
    if(e.clipboardData&&e.clipboardData.items) for(var i=0;i<e.clipboardData.items.length;i++){
      var item=e.clipboardData.items[i];
      if(item.type.startsWith('image/')){ var f=item.getAsFile(); if(f)addImageAttachment(f); }
    }
  });

  // ── Slash Commands ──
  var slashCommands = [
    {cmd:'/clear', icon:'🗑️', desc:'清空聊天'},
    {cmd:'/new', icon:'➕', desc:'新建会话'},
    {cmd:'/cancel', icon:'⏹️', desc:'取消当前任务'},
    {cmd:'/model', icon:'🤖', desc:'切换模型 (sonnet/opus/haiku)'},
    {cmd:'/thinking', icon:'💡', desc:'开关深度思考'},
    {cmd:'/mode', icon:'🔧', desc:'切换模式 (build/plan/explore)'},
  ];
  function showSlashPanel(filter) {
    if (!popupPanelEl) return;
    var f = (filter||'').toLowerCase();
    var items = slashCommands.filter(function(c){return c.cmd.indexOf(f)===0;});
    if (!items.length) { hidePopup(); return; }
    popupItems=items; popupSelectedIdx=0; popupType='slash'; popupActive=true;
    renderPopup();
  }
  function showFilePanel(query) {
    if (!popupPanelEl) return;
    vscode.postMessage({type:'fileSearch',query:query||''});
  }
  function renderPopup() {
    if (!popupPanelEl||!popupActive) return;
    var h='';
    for (var i=0;i<popupItems.length;i++) {
      var it=popupItems[i], cls='popup-item'+(i===popupSelectedIdx?' active':'');
      h+='<div class="'+cls+'" data-idx="'+i+'">'
        +'<span class="popup-item-icon">'+(it.icon||'📄')+'</span>'
        +'<span class="popup-item-label">'+(it.cmd||it.label||'')+'</span>'
        +'<span class="popup-item-desc">'+(it.desc||'')+'</span></div>';
    }
    popupPanelEl.innerHTML=h;
    popupPanelEl.classList.add('visible');
    popupPanelEl.querySelectorAll('.popup-item').forEach(function(el){
      el.addEventListener('click',function(){
        selectPopupItem(parseInt(el.getAttribute('data-idx')));
      });
    });
  }
  function hidePopup() {
    popupActive=false; popupItems=[]; popupSelectedIdx=0; popupType='';
    if(popupPanelEl){popupPanelEl.classList.remove('visible');popupPanelEl.innerHTML='';}
  }
  function selectPopupItem(idx) {
    var item=popupItems[idx]; if(!item) return;
    if (popupType==='slash') {
      var cmd=item.cmd; hidePopup();
      if(cmd==='/clear'){vscode.postMessage({type:'clear'});inputEl.value='';}
      else if(cmd==='/new'){vscode.postMessage({type:'newSession'});inputEl.value='';}
      else if(cmd==='/cancel'){vscode.postMessage({type:'cancel'});inputEl.value='';}
      else if(cmd==='/model'){inputEl.value='/model ';inputEl.focus();}
      else if(cmd==='/thinking'){
        if(thinkingToggleEl){thinkingToggleEl.checked=!thinkingToggleEl.checked;updateThinkingSettings();}
        inputEl.value='';
      }
      else if(cmd==='/mode'){inputEl.value='/mode ';inputEl.focus();}
    } else if (popupType==='file') {
      var path=item.path||item.label;
      var val=inputEl.value, atIdx=val.lastIndexOf('@');
      inputEl.value=val.substring(0,atIdx)+'@'+path+' ';
      hidePopup(); inputEl.focus();
    }
  }

  // ── Settings ──
  function updateThinkingSettings() {
    vscode.postMessage({type:'updateThinking',enabled:thinkingToggleEl?thinkingToggleEl.checked:false,budget:thinkingBudgetEl?parseInt(thinkingBudgetEl.value,10):16000});
  }
  function updateRuntimeSettings() {
    vscode.postMessage({type:'updateRuntime',agentType:agentTypeEl?agentTypeEl.value:'build',model:modelSelectEl?modelSelectEl.value:'sonnet'});
  }
  // ── Send ──
  function sendMessage() {
    var text=inputEl.value.trim();
    // Handle /model and /mode inline commands
    var modelMatch=text.match(/^\/model\s+(\w+)$/i);
    if(modelMatch){if(modelSelectEl){modelSelectEl.value=modelMatch[1];updateRuntimeSettings();}inputEl.value='';return;}
    var modeMatch=text.match(/^\/mode\s+(\w+)$/i);
    if(modeMatch){if(agentTypeEl){agentTypeEl.value=modeMatch[1];updateRuntimeSettings();}inputEl.value='';return;}
    if(!text||state.pending)return;
    inputHistory.push(text); inputHistoryIndex=inputHistory.length;
    var msg={type:'send',text:text};
    if(attachments.length>0){msg.attachments=attachments.slice();attachments=[];renderAttachments();}
    vscode.postMessage(msg); inputEl.value=''; inputEl.focus();
  }
  // ── Event Bindings ──
  sendEl.addEventListener('click',sendMessage);
  if(clearEl)clearEl.addEventListener('click',function(){vscode.postMessage({type:'clear'});});
  if(cancelEl)cancelEl.addEventListener('click',function(){vscode.postMessage({type:'cancel'});});
  if(newSessionEl)newSessionEl.addEventListener('click',function(){vscode.postMessage({type:'newSession'});});
  if(thinkingToggleEl)thinkingToggleEl.addEventListener('change',updateThinkingSettings);
  if(thinkingBudgetEl)thinkingBudgetEl.addEventListener('change',updateThinkingSettings);
  if(agentTypeEl)agentTypeEl.addEventListener('change',updateRuntimeSettings);
  if(modelSelectEl)modelSelectEl.addEventListener('change',updateRuntimeSettings);

  // ── Keyboard shortcuts ──
  inputEl.addEventListener('keydown',function(e){
    // Popup navigation
    if(popupActive){
      if(e.key==='ArrowDown'){e.preventDefault();popupSelectedIdx=Math.min(popupSelectedIdx+1,popupItems.length-1);renderPopup();return;}
      if(e.key==='ArrowUp'){e.preventDefault();popupSelectedIdx=Math.max(popupSelectedIdx-1,0);renderPopup();return;}
      if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();selectPopupItem(popupSelectedIdx);return;}
      if(e.key==='Escape'){e.preventDefault();hidePopup();return;}
    }
    // Enter to send (without Shift)
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();return;}
    // Input history
    if(e.key==='ArrowUp'&&inputEl.selectionStart===0){
      if(inputHistoryIndex>0){inputHistoryIndex--;inputEl.value=inputHistory[inputHistoryIndex];}e.preventDefault();return;
    }
    if(e.key==='ArrowDown'&&inputEl.selectionStart===inputEl.value.length){
      if(inputHistoryIndex<inputHistory.length-1){inputHistoryIndex++;inputEl.value=inputHistory[inputHistoryIndex];}
      else {inputHistoryIndex=inputHistory.length;inputEl.value='';}
      e.preventDefault();return;
    }
  });
  // Input change monitoring for slash/file popup
  inputEl.addEventListener('input',function(){
    var val=inputEl.value;
    // Slash commands: only if line starts with /
    if(val.match(/^\/\w*$/)){showSlashPanel(val);return;}
    // File autocomplete: detect @query
    var atMatch=val.match(/@(\S*)$/);
    if(atMatch&&atMatch.index===val.lastIndexOf('@')){showFilePanel(atMatch[1]);return;}
    if(popupActive)hidePopup();
  });
  // Global shortcuts
  document.addEventListener('keydown',function(e){
    if(e.ctrlKey&&e.key==='l'){e.preventDefault();vscode.postMessage({type:'clear'});}
    if(e.ctrlKey&&e.key==='n'){e.preventDefault();vscode.postMessage({type:'newSession'});}
    if(e.key==='Escape'&&state.pending){vscode.postMessage({type:'cancel'});}
  });
  // -- Code block copy --
  messagesEl.addEventListener('click',function(e){
    var copyBtn=e.target.closest('.code-block-copy');
    if(copyBtn){
      var id=copyBtn.getAttribute('data-cbid');
      var codeEl=document.getElementById(id);
      if(codeEl){
        navigator.clipboard.writeText(codeEl.textContent).then(function(){
          copyBtn.textContent='已复制';copyBtn.classList.add('copied');
          setTimeout(function(){copyBtn.textContent='复制';copyBtn.classList.remove('copied');},2000);
        });
      }
      return;
    }
    var fileLink=e.target.closest('.tool-file-link');
    if(fileLink){
      var fp=fileLink.getAttribute('data-file');
      if(fp)vscode.postMessage({type:'openFile',filePath:fp});
    }
  });
  // -- Message handler --
  window.addEventListener('message',function(event){
    var msg=event.data;
    if(msg.type==='state'){
      if(msg.messages!==undefined) state.messages=msg.messages;
      if(msg.pending!==undefined) state.pending=msg.pending;
      if(msg.thinkingEnabled!==undefined) state.thinkingEnabled=msg.thinkingEnabled;
      if(msg.thinkingBudget!==undefined) state.thinkingBudget=msg.thinkingBudget;
      if(msg.agentType!==undefined) state.agentType=msg.agentType;
      if(msg.model!==undefined) state.model=msg.model;
      if(msg.runStatus!==undefined) state.runStatus=msg.runStatus;
      if(msg.sessionId!==undefined) state.sessionId=msg.sessionId;
      if(msg.pendingQuestion!==undefined) state.pendingQuestion=msg.pendingQuestion;
      if(msg.usage!==undefined) state.usage=msg.usage;
      if(msg.todoList!==undefined) state.todoList=msg.todoList;
      render();
    }
    if(msg.type==='appendMessage'){
      state.messages.push(msg.message);
      render();
    }
    if(msg.type==='fileSearchResults'){
      if(msg.files&&msg.files.length){
        popupItems=msg.files.map(function(f){return{label:f.name||f,path:f.path||f,icon:'📄',desc:f.path||''};});
        popupSelectedIdx=0; popupType='file'; popupActive=true;
        renderPopup();
      } else { hidePopup(); }
    }
    if(msg.type==='captureSnapshot'){
      // DOM snapshot + computed styles for key elements
      var snapshot = {};
      snapshot.html = messagesEl ? messagesEl.innerHTML.substring(0, 5000) : '';
      snapshot.messageCount = state.messages.length;
      snapshot.pending = state.pending;
      snapshot.runStatus = state.runStatus;
      snapshot.usage = state.usage;
      snapshot.errors = [];
      // Check key element visibility/styles
      var checks = [
        {sel:'#messages', name:'messages'},
        {sel:'#input', name:'input'},
        {sel:'.footer', name:'footer'},
        {sel:'#usage-bar', name:'usageBar'},
        {sel:'.question-panel', name:'questionPanel'},
      ];
      snapshot.elements = {};
      for(var ci=0;ci<checks.length;ci++){
        var el=document.querySelector(checks[ci].sel);
        if(el){
          var cs=window.getComputedStyle(el);
          snapshot.elements[checks[ci].name]={
            visible: cs.display!=='none'&&cs.visibility!=='hidden',
            width: el.offsetWidth, height: el.offsetHeight,
            bg: cs.backgroundColor, color: cs.color,
          };
        } else {
          snapshot.elements[checks[ci].name]=null;
        }
      }
      // Last 3 messages content preview
      snapshot.recentMessages = state.messages.slice(-3).map(function(m){
        return {role:m.role, kind:m.kind||'', content:(m.content||'').substring(0,200)};
      });
      vscode.postMessage({type:'snapshotResult', snapshot:snapshot, requestId:msg.requestId});
    }
  });
  // -- Error capture for self-iteration --
  window.onerror = function(msg, src, line, col, err) {
    vscode.postMessage({type:'webviewError', error: String(msg), source: src, line: line, col: col});
    return false;
  };
  window.addEventListener('unhandledrejection', function(e) {
    vscode.postMessage({type:'webviewError', error: 'UnhandledRejection: ' + String(e.reason)});
  });
  var origConsoleError = console.error;
  console.error = function() {
    var args = Array.prototype.slice.call(arguments);
    var msg = args.map(function(a){return typeof a==='object'?JSON.stringify(a):String(a);}).join(' ');
    vscode.postMessage({type:'webviewError', error: '[console.error] ' + msg});
    origConsoleError.apply(console, arguments);
  };
  // -- Init --
  vscode.postMessage({type:'ready'});
  inputEl.focus();
})();

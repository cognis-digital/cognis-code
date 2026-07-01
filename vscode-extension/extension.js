// Cognis Code — local uncensored AI agent for VS Code.
// Chat + agentic loop (plan -> run shell / edit files -> observe -> iterate) on YOUR local
// fleet (Ollama/llama.cpp). Loads only the relevant repos/MCPs into context (no window overload).
// No cloud, no keys. Meets the Claude-Code / opencode / Aider pattern, fully local + uncensored.
const vscode = require('vscode');
const http = require('http');
const { exec } = require('child_process');

const DANGER = /\brm\s+-rf\s+[\/~]|\bmkfs|format\s+[a-z]:|\bdd\s+if=|Remove-Item.*-Recurse.*[Cc]:\\?\s*$|\bshutdown\b|\breboot\b/i;
const cfg = () => vscode.workspace.getConfiguration('cognisCode');

function fleet(messages, numPredict = 700) {
  return new Promise((resolve, reject) => {
    const url = new URL(cfg().get('endpoint') + '/api/chat');
    const body = JSON.stringify({ model: cfg().get('model'), messages, stream: false,
      options: { num_predict: numPredict, temperature: 0.3 } });
    const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname,
      method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { const j = JSON.parse(d);
          resolve((j.message && (j.message.content || j.message.thinking)) || ''); }
          catch (e) { reject(e); } });
      });
    req.on('error', reject); req.write(body); req.end();
  });
}

function loadCapabilities(query) {
  return new Promise((resolve) => {
    const c = cfg().get('capabilitiesCmd');
    if (!c) return resolve('');
    exec(`${c} "${query.replace(/"/g, '')}"`, { timeout: 15000 }, (e, out) => {
      if (e || !out) return resolve('');
      resolve('Relevant local capabilities (loaded for this task):\n' + out.trim());
    });
  });
}

function workspaceCwd() {
  const f = vscode.workspace.workspaceFolders;
  return f && f.length ? f[0].uri.fsPath : process.cwd();
}

async function runShell(cmd, post) {
  if (DANGER.test(cmd)) { post('sys', `REFUSED (destructive): ${cmd}`); return 'refused'; }
  if (!cfg().get('autonomous')) {
    const ok = await vscode.window.showWarningMessage(`Run: ${cmd}`, { modal: false }, 'Run', 'Skip');
    if (ok !== 'Run') { post('sys', `skipped: ${cmd}`); return 'skipped'; }
  }
  return new Promise((resolve) => {
    exec(cmd, { cwd: workspaceCwd(), timeout: 120000, shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash' },
      (e, out, err) => { const r = (out || '') + (err ? '\n' + err : ''); post('tool', `$ ${cmd}\n${r.slice(-2000)}`); resolve(r.slice(-1500)); });
  });
}

const BLK = /```(?:sh|bash|powershell|ps1?|cmd)?\s*([\s\S]+?)```/i;

async function agentLoop(task, post) {
  post('sys', 'thinking + selecting relevant capabilities…');
  const ctx = await loadCapabilities(task);
  let history = '';
  const steps = cfg().get('maxSteps');
  for (let i = 0; i < steps; i++) {
    const prompt = `${ctx}\n\nTASK: ${task}\nWorkspace: ${workspaceCwd()}\n` +
      (history ? `Previous steps:\n${history}\n` : '') +
      `Give the SINGLE next shell command (in a \`\`\`sh\`\`\` block) to make progress, or reply DONE if complete. Prefer commands that verify the result.`;
    let reply;
    try { reply = await fleet(prompt, 250); } catch (e) { post('sys', `fleet error: ${e} (is it up?)`); return; }
    if (/\bDONE\b/.test(reply) && !reply.includes('```')) { post('assistant', 'Task complete.'); return; }
    const m = BLK.exec(reply);
    const cmd = m ? m[1].trim().split('\n')[0].trim() : '';
    if (!cmd) { post('assistant', reply.slice(0, 1200)); return; }
    const out = await runShell(cmd, post);
    history += `$ ${cmd}\n${out.slice(0, 500)}\n`;
    if (out === 'skipped' || out === 'refused') return;
  }
  post('sys', 'reached max steps.');
}

class ChatView {
  constructor(ctx) { this.ctx = ctx; }
  resolveWebviewView(view) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html();
    const post = (role, text) => view.webview.postMessage({ role, text });
    view.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'ask') {
        post('user', msg.text);
        const ctx = await loadCapabilities(msg.text);
        if (ctx) post('sys', 'loaded: ' + ctx.split('\n').slice(1, 4).map(l => l.split(':')[0].replace(/^- /, '')).join(', '));
        try { post('assistant', await fleet([{ role: 'user', content: (ctx ? ctx + '\n\n' : '') + msg.text }])); }
        catch (e) { post('sys', 'fleet error: ' + e); }
      } else if (msg.type === 'agent') {
        post('user', '[agent] ' + msg.text);
        await agentLoop(msg.text, post);
      }
    });
  }
  html() {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);margin:0;padding:8px;background:var(--vscode-sideBar-background)}
      #log{height:calc(100vh - 120px);overflow:auto;font-size:13px}
      .m{margin:6px 0;padding:6px 9px;border-radius:8px;white-space:pre-wrap;word-break:break-word}
      .user{background:#6b46c133;border-left:3px solid #8b5fd0}
      .assistant{background:#2a1a4a44}
      .sys{color:#9a86c0;font-size:11px;font-style:italic} .tool{background:#0a0710;font-family:monospace;font-size:11px;color:#5fe0a0}
      #bar{position:fixed;bottom:6px;left:6px;right:6px;display:flex;gap:4px}
      textarea{flex:1;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid #6b3fa0;border-radius:6px;padding:5px;resize:none;height:40px}
      button{background:#6b46c1;color:#fff;border:none;border-radius:6px;padding:0 10px;cursor:pointer}
      h3{color:#c9a8ff;margin:0 0 6px}</style></head>
      <body><h3>Cognis Code · local · uncensored</h3><div id="log"></div>
      <div id="bar"><textarea id="q" placeholder="Ask, or describe a task for the agent…"></textarea>
      <button onclick="send('ask')">Ask</button><button onclick="send('agent')" title="Run as an agent (shell+files)">Agent</button></div>
      <script>const v=acquireVsCodeApi(),log=document.getElementById('log'),q=document.getElementById('q');
      function add(r,t){const d=document.createElement('div');d.className='m '+r;d.textContent=t;log.appendChild(d);log.scrollTop=log.scrollHeight;}
      function send(type){const t=q.value.trim();if(!t)return;q.value='';v.postMessage({type,text:t});}
      q.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send('ask');}});
      window.addEventListener('message',e=>add(e.data.role,e.data.text));</script></body></html>`;
  }
}

function activate(context) {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('cognisCode.chat', new ChatView(context)),
    vscode.commands.registerCommand('cognisCode.ask', async () => {
      const q = await vscode.window.showInputBox({ prompt: 'Ask Cognis Code (local)' }); if (!q) return;
      const ctx = await loadCapabilities(q);
      vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Cognis Code…' },
        async () => { const a = await fleet([{ role: 'user', content: (ctx ? ctx + '\n\n' : '') + q }]);
          const doc = await vscode.workspace.openTextDocument({ content: a, language: 'markdown' });
          vscode.window.showTextDocument(doc); });
    }),
    vscode.commands.registerCommand('cognisCode.agent', async () => {
      const t = await vscode.window.showInputBox({ prompt: 'Agent task (runs shell/edits in this workspace)' }); if (!t) return;
      const out = vscode.window.createOutputChannel('Cognis Agent'); out.show();
      await agentLoop(t, (r, x) => out.appendLine(`[${r}] ${x}`));
    }),
    vscode.commands.registerCommand('cognisCode.explain', async () => {
      const ed = vscode.window.activeTextEditor; if (!ed) return;
      const sel = ed.document.getText(ed.selection) || ed.document.getText();
      const a = await fleet([{ role: 'user', content: 'Explain this code concisely:\n\n' + sel.slice(0, 4000) }]);
      vscode.window.showInformationMessage(a.slice(0, 400));
    }),
    vscode.commands.registerCommand('cognisCode.toggleAutonomous', async () => {
      const c = cfg(); const cur = c.get('autonomous');
      await c.update('autonomous', !cur, true);
      vscode.window.showInformationMessage('Autonomous execution: ' + (!cur ? 'ON (guarded)' : 'off (approve each)'));
    })
  );
}
function deactivate() {}
module.exports = { activate, deactivate };

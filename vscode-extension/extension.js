// Cognis Code — local uncensored AI agent for VS Code.
// Native Copilot-class features on YOUR fleet (Ollama/llama.cpp), no cloud/keys:
//  - Inline completions (ghost text)      - @cognis chat participant (streaming)
//  - Language Model Tools (shell/editFiles/capability/connector = native tool-calling)
//  - Multi-file diff-apply, inline edits  - intelligent capability loading (400+ repos/MCPs)
const vscode = require('vscode');
const http = require('http');
const { exec } = require('child_process');

const DANGER = /\brm\s+-rf\s+[\/~]|\bmkfs|format\s+[a-z]:|\bdd\s+if=|Remove-Item.*-Recurse.*[Cc]:\\?\s*$|\bshutdown\b|\breboot\b/i;
const cfg = () => vscode.workspace.getConfiguration('cognisCode');
const cwd = () => { const f = vscode.workspace.workspaceFolders; return f && f.length ? f[0].uri.fsPath : process.cwd(); };
const BLK = /```(?:sh|bash|powershell|ps1?|cmd)?\s*([\s\S]+?)```/i;

// ---- fleet (Ollama /api/chat), streaming + blocking -----------------------
function req(pathBody, onChunk) {
  return new Promise((resolve, reject) => {
    const url = new URL(cfg().get('endpoint') + '/api/chat');
    const r = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json' } }, (res) => {
      let buf = '', full = '';
      res.on('data', (c) => {
        buf += c; let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          try { const j = JSON.parse(line); const t = (j.message && (j.message.content || j.message.thinking)) || '';
            if (t) { full += t; if (onChunk) onChunk(t); } } catch (e) {}
        }
      });
      res.on('end', () => resolve(full));
    });
    r.on('error', reject); r.write(pathBody); r.end();
  });
}
function payload(messages, np, stream, model) {
  return JSON.stringify({ model: model || cfg().get('model'), messages, stream: !!stream,
    options: { num_predict: np, temperature: 0.3 } });
}
const fleet = (messages, np = 700, model) => req(payload(messages, np, false, model));
const streamFleet = (messages, onChunk, np = 900, model) => req(payload(messages, np, true, model), onChunk);
const fs = require('fs'); const path = require('path');
function detectVerify() {  // coding-quality multiplier: run the project's tests/build
  const r = cwd(); const has = (f) => fs.existsSync(path.join(r, f));
  if (has('pyproject.toml') || has('pytest.ini') || has('tests')) return 'python -m pytest -q';
  if (has('package.json')) return 'npm test --silent';
  if (has('Cargo.toml')) return 'cargo test -q';
  if (has('go.mod')) return 'go test ./...';
  if (has('Makefile')) return 'make test';
  return null;
}

function loadCapabilities(query) {
  return new Promise((resolve) => {
    const c = cfg().get('capabilitiesCmd'); if (!c) return resolve('');
    exec(`${c} "${query.replace(/"/g, '')}"`, { timeout: 15000 }, (e, out) =>
      resolve(e || !out ? '' : 'Relevant local capabilities:\n' + out.trim()));
  });
}

// ---- actions the tools/agent perform --------------------------------------
async function runShell(command, autoOk) {
  if (DANGER.test(command)) return `REFUSED (destructive): ${command}`;
  if (!autoOk && !cfg().get('autonomous')) {
    const ok = await vscode.window.showWarningMessage(`Run: ${command}`, 'Run', 'Skip');
    if (ok !== 'Run') return `skipped: ${command}`;
  }
  return new Promise((resolve) => exec(command, { cwd: cwd(), timeout: 120000,
    shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash' },
    (e, out, err) => resolve(((out || '') + (err ? '\n' + err : '')).slice(-3000) || '(no output)')));
}
async function applyEdits(edits) {
  const we = new vscode.WorkspaceEdit(); const root = vscode.workspace.workspaceFolders[0].uri;
  for (const ed of edits) {
    const uri = vscode.Uri.joinPath(root, ed.path);
    try { await vscode.workspace.fs.stat(uri);
      const doc = await vscode.workspace.openTextDocument(uri);
      we.replace(uri, new vscode.Range(0, 0, doc.lineCount, 0), ed.content);
    } catch { we.createFile(uri, { overwrite: true, contents: Buffer.from(ed.content) }); }
  }
  await vscode.workspace.applyEdit(we);
  return `applied ${edits.length} file edit(s): ${edits.map(e => e.path).join(', ')}`;
}
function callConnector(name, action) {
  return new Promise((resolve) => exec(
    `python C:\\Users\\user\\cognis-control\\connectors.py test ${name}`, { timeout: 15000 },
    (e, out) => resolve(`connector ${name}: ${(out || String(e)).trim()}${action ? ' | action: ' + action + ' (wire endpoint)' : ''}`)));
}

// ---- agent loop (used by /agent and the agent command) --------------------
async function agentLoop(task, emit) {
  const ctx = await loadCapabilities(task); let history = '';
  for (let i = 0; i < (cfg().get('maxSteps') || 6); i++) {
    const prompt = `${ctx}\n\nTASK: ${task}\nWorkspace: ${cwd()}\n${history ? 'Previous:\n' + history : ''}\n` +
      'Give the SINGLE next shell command in a ```sh``` block, or reply DONE if complete.';
    const reply = await fleet([{ role: 'user', content: prompt }], 250);
    if (/\bDONE\b/.test(reply) && !reply.includes('```')) { emit('\n✓ done.'); return; }
    const m = BLK.exec(reply); const command = m ? m[1].trim().split('\n')[0].trim() : '';
    if (!command) { emit('\n' + reply.slice(0, 1000)); return; }
    emit(`\n$ ${command}\n`); const out = await runShell(command);
    emit(out.slice(0, 1200)); history += `$ ${command}\n${out.slice(0, 400)}\n`;
    if (out.startsWith('skipped') || out.startsWith('REFUSED')) return;
  }
  // VERIFY: run the project's tests/build; if failing, one fleet-driven fix pass
  if (cfg().get('verify')) {
    const vcmd = detectVerify();
    if (vcmd) {
      emit(`\n▶ verify: ${vcmd}\n`); const vout = await runShell(vcmd, true); emit(vout.slice(0, 1200));
      if (/fail|error|Error|FAILED|assert|Traceback/.test(vout)) {
        emit('\n↻ fixing failures…\n');
        const fix = await fleet([{ role: 'user', content:
          `Task: ${task}\nTests failed:\n${vout.slice(-1500)}\nGive the SINGLE shell command to fix it in a \`\`\`sh\`\`\` block.` }], 250);
        const fm = BLK.exec(fix); if (fm) { const fc = fm[1].trim().split('\n')[0].trim();
          emit(`$ ${fc}\n`); emit((await runShell(fc)).slice(0, 1000)); }
      } else emit('\n✓ verify passed'); return;
    }
  }
  emit('\n(max steps)');
}

function activate(context) {
  const S = context.subscriptions;

  // 1) INLINE COMPLETIONS (ghost text) — the signature Copilot feature
  S.push(vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, {
    async provideInlineCompletionItems(document, position, ctx, token) {
      if (!cfg().get('inlineCompletions', true)) return;
      const prefix = document.getText(new vscode.Range(Math.max(0, position.line - 60), 0, position.line, position.character));
      const suffix = document.getText(new vscode.Range(position, new vscode.Position(position.line + 20, 0)));
      const p = `You are a code completion engine for ${document.languageId}. Continue the code at <CURSOR>. ` +
        `Output ONLY the completion, no prose, no fences.\n\n${prefix}<CURSOR>${suffix}`;
      try {
        const txt = await fleet([{ role: 'user', content: p }], 80, cfg().get('codeModel'));
        if (token.isCancellationRequested) return;
        const clean = txt.replace(/```[a-z]*\n?/gi, '').split('<CURSOR>')[0].trimEnd();
        return clean ? [new vscode.InlineCompletionItem(clean, new vscode.Range(position, position))] : undefined;
      } catch { return; }
    }
  }));

  // 2) NATIVE CHAT PARTICIPANT — @cognis (streaming + slash commands + capability loading)
  const handler = async (request, chatCtx, stream, token) => {
    const q = request.prompt;
    if (request.command === 'agent') { await agentLoop(q, (t) => stream.markdown(t)); return {}; }
    if (request.command === 'edit') {
      const ed = vscode.window.activeTextEditor;
      const code = ed ? ed.document.getText(ed.selection) || ed.document.getText() : '';
      const out = await fleet([{ role: 'user', content: `Rewrite this code per: "${q}". Output only the new code.\n\n${code}` }], 900);
      const m = out.replace(/```[a-z]*\n?/gi, '');
      if (ed) await applyEdits([{ path: vscode.workspace.asRelativePath(ed.document.uri), content: m }]);
      stream.markdown('Applied edit.'); return {};
    }
    stream.progress('loading relevant capabilities…');
    const ctx = await loadCapabilities(q);
    if (ctx) stream.markdown('_loaded: ' + ctx.split('\n').slice(1, 4).map(l => l.split(':')[0].replace(/^-\s*/, '')).join(', ') + '_\n\n');
    await streamFleet([{ role: 'user', content: (ctx ? ctx + '\n\n' : '') + q }], (t) => stream.markdown(t));
    return {};
  };
  const participant = vscode.chat.createChatParticipant('cognis.code', handler);
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');
  S.push(participant);

  // 3) LANGUAGE MODEL TOOLS — native tool-calling (shell / editFiles / capability / connector)
  const tool = (fn) => ({ invoke: async (options) => {
    const r = await fn(options.input || {});
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(String(r))]);
  }});
  S.push(vscode.lm.registerTool('cognis_shell', tool((i) => runShell(i.command, false))));
  S.push(vscode.lm.registerTool('cognis_editFiles', tool((i) => applyEdits(i.edits || []))));
  S.push(vscode.lm.registerTool('cognis_capability', tool((i) => new Promise((res) => {
    const out = vscode.window.createOutputChannel('Cognis Agent'); out.show();
    agentLoop(i.task, (t) => out.append(t)).then(() => res('capability run — see Cognis Agent output')); }))));
  S.push(vscode.lm.registerTool('cognis_connector', tool((i) => callConnector(i.name, i.action))));

  // 4) COMMANDS
  S.push(
    vscode.commands.registerCommand('cognisCode.ask', async () => {
      const q = await vscode.window.showInputBox({ prompt: 'Ask Cognis Code (local)' }); if (!q) return;
      const ctx = await loadCapabilities(q);
      const a = await fleet([{ role: 'user', content: (ctx ? ctx + '\n\n' : '') + q }]);
      const doc = await vscode.workspace.openTextDocument({ content: a, language: 'markdown' });
      vscode.window.showTextDocument(doc);
    }),
    vscode.commands.registerCommand('cognisCode.agent', async () => {
      const t = await vscode.window.showInputBox({ prompt: 'Agent task (runs shell/edits here)' }); if (!t) return;
      const out = vscode.window.createOutputChannel('Cognis Agent'); out.show();
      await agentLoop(t, (x) => out.append(x));
    }),
    vscode.commands.registerCommand('cognisCode.explain', async () => {
      const ed = vscode.window.activeTextEditor; if (!ed) return;
      const a = await fleet([{ role: 'user', content: 'Explain concisely:\n\n' + (ed.document.getText(ed.selection) || ed.document.getText()).slice(0, 4000) }]);
      const doc = await vscode.workspace.openTextDocument({ content: a, language: 'markdown' }); vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    }),
    vscode.commands.registerCommand('cognisCode.edit', async () => {
      const ed = vscode.window.activeTextEditor; if (!ed) return;
      const ins = await vscode.window.showInputBox({ prompt: 'Edit instruction for selection' }); if (!ins) return;
      const code = ed.document.getText(ed.selection) || ed.document.getText();
      const out = (await fleet([{ role: 'user', content: `Rewrite per "${ins}". Output only code.\n\n${code}` }], 900)).replace(/```[a-z]*\n?/gi, '');
      await ed.edit((e) => e.replace(ed.selection.isEmpty ? new vscode.Range(0, 0, ed.document.lineCount, 0) : ed.selection, out));
    }),
    vscode.commands.registerCommand('cognisCode.toggleAutonomous', async () => {
      const c = cfg(); const cur = c.get('autonomous'); await c.update('autonomous', !cur, true);
      vscode.window.showInformationMessage('Autonomous execution: ' + (!cur ? 'ON (guarded)' : 'off'));
    })
  );
}
function deactivate() {}
module.exports = { activate, deactivate };

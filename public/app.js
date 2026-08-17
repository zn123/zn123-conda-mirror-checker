const $ = (s) => document.querySelector(s);
const tbody = document.querySelector('#result tbody');

function fmt(r) {
  if (!r) return '—';
  if (r.error) return r.error;
  return `${r.statusCode ?? '—'} · ${r.latency ?? 0}ms`;
}

// 索引单元格：在状态码后标注实际探测的索引文件（current_repodata.json / 回退 repodata.json）
function fmtRepo(m) {
  const base = fmt(m.repodata);
  const fellBack = m.repodataFile === 'repodata.json';
  const file = fellBack ? 'repodata' : 'current';
  const tag = fellBack ? ' ↩回退' : '';
  return `${base}<div class="idx-file">${file}${tag}</div>`;
}

function short(s) {
  return s === 'ok' ? '可用' : s === 'partial' ? '部分' : '故障';
}

function note(m) {
  const notes = [];
  if (m.pythonNote) notes.push(m.pythonNote);
  if (m.proxyNote) notes.push('↪ ' + m.proxyNote);
  if (m.channels) {
    const d = m.channels.defaults, c = m.channels.condaforge;
    notes.push(`defaults:${short(d.status)} / conda-forge:${short(c.status)}`);
  }
  if (m.repodata.isHtml) notes.push('返回网页门户（非 conda 索引）');
  if (m.repodata.statusCode === 404) notes.push('索引 404');
  if (m.pkg.statusCode === 502) notes.push('包下载 502（后端故障）');
  if (m.pkg.statusCode === 403) notes.push('包下载 403（无权限）');
  if (m.repodata.error) notes.push('索引: ' + m.repodata.error);
  if (m.pkg.error && m.pkg.error !== m.repodata.error) notes.push('包: ' + m.pkg.error);
  if (m.repodataOk && !m.pkgOk) notes.push('索引可用，但包下载故障');
  if (!m.repodataOk && m.pkgOk) notes.push('索引故障，但包可下载');
  return notes.join('；') || '—';
}

function label(s) {
  return s === 'ok' ? '✅ 可用' : s === 'partial' ? '⚠️ 部分' : '❌ 故障';
}

// 渲染未检测列表（页面初始状态）
function renderPending(mirrors) {
  tbody.innerHTML = '';
  mirrors.forEach((m) => {
    const tr = document.createElement('tr');
    tr.className = 'pending';
    tr.dataset.id = m.id;
    tr.innerHTML = `
      <td class="name">${m.name}<div class="base">${m.base}</div></td>
      <td>—</td>
      <td>—</td>
      <td>—</td>
      <td><span class="badge pending">待检测</span></td>
      <td class="note">—</td>
    `;
    tbody.appendChild(tr);
  });
}

// 实时更新/插入某一行（SSE mirror 事件驱动）
function upsertRow(m) {
  let tr = tbody.querySelector(`tr[data-id="${m.id}"]`);
  if (!tr) {
    tr = document.createElement('tr');
    tr.dataset.id = m.id;
    tbody.appendChild(tr);
  }
  tr.className = m.status;
  const proxyBadge = m.redirected ? '<span class="badge proxy">↪代理</span>' : '';
  tr.innerHTML = `
    <td class="name">${m.name}${proxyBadge}<div class="base">${m.base}</div></td>
    <td>${fmtRepo(m)}</td>
    <td>${fmt(m.pkg)}</td>
    <td>${m.latency}ms</td>
    <td><span class="badge ${m.status}">${label(m.status)}</span></td>
    <td class="note">${note(m)}</td>
  `;
}

// 初始：仅拉取镜像列表，显示“待检测”，不发起探测
async function loadMirrors() {
  try {
    const resp = await fetch('/api/mirrors');
    const data = await resp.json();
    renderPending(data.mirrors);
    $('#summary').textContent = `共 ${data.mirrors.length} 个镜像源，点击「开始检测」发起探测`;
  } catch (e) {
    $('#summary').textContent = '加载镜像列表失败: ' + e.message;
  }
}

// ---- 探测日志面板 ----
function fmtLog(e) {
  const t = (e.ts || '').replace('T', ' ').replace('Z', '');
  let msg;
  switch (e.step) {
    case 'request': msg = `请求开始 platform=${e.platform} python=${e.python}`; break;
    case 'start': msg = `开始探测 ${e.name || ''}`; break;
    case 'repodata': msg = `repodata(${e.file || 'current'}) -> ${e.statusCode ?? 'ERR'} (${e.latency}ms) ${e.ok ? 'OK' : 'FAIL'}${e.error ? ' err=' + e.error : ''}`; break;
    case 'repodata-fallback': msg = `回退 repodata.json -> ${e.statusCode ?? 'ERR'} (${e.latency ?? '?'}ms) ${e.ok ? 'OK' : 'FAIL'}${e.error ? ' err=' + e.error : ''}`; break;
    case 'parse': msg = `parse pythonLatest=${e.pythonLatest ?? 'null'} pkgCount=${e.pkgCount}`; break;
    case 'pkg': msg = `pkg(${e.pkgName}) -> ${e.statusCode ?? 'ERR'} (${e.latency}ms) ${e.ok ? 'OK' : 'FAIL'}${e.error ? ' err=' + e.error : ''}`; break;
    case 'result': msg = `RESULT ${e.status} ${e.pythonNote}`; break;
    case 'done': msg = `完成 日志已落盘 ${e.logFile || ''}`; break;
    default: msg = JSON.stringify(e);
  }
  return { t, msg, step: e.step, mirror: e.mirror };
}

function logLineText(e) {
  const { t, msg, step, mirror } = fmtLog(e);
  return `[${t}] ${step}${mirror ? ' [' + mirror + ']' : ''} ${msg}`;
}

function appendLog(e) {
  const { t, msg, step, mirror } = fmtLog(e);
  const div = document.createElement('div');
  div.className = `log-line step-${step}` + (mirror ? ` src-${mirror}` : '');
  div.innerHTML = `<span class="log-t">${t}</span><span class="log-m">${mirror ? '[' + mirror + '] ' : ''}${msg}</span>`;
  $('#logBody').appendChild(div);
  $('#logBody').scrollTop = $('#logBody').scrollHeight; // 自动滚到底部
}

// ---- 检测：改用 EventSource 实时消费 SSE ----
let es = null;
let lastLogs = [];

function check() {
  const platform = $('#platform').value;
  const py = $('#python').value;
  const channel = $('#channel').value;
  if (es) es.close();

  $('#logBody').innerHTML = '';
  lastLogs = [];
  $('#logCount').textContent = '';
  $('#downloadLog').hidden = true;
  $('#status').textContent = '检测中…';
  $('#checkBtn').disabled = true;

  es = new EventSource(`/api/check?platform=${encodeURIComponent(platform)}&python=${encodeURIComponent(py)}&channel=${encodeURIComponent(channel)}`);

  es.addEventListener('meta', (ev) => {
    try {
      const d = JSON.parse(ev.data);
      $('#summary').textContent = `频道=${d.channel} · 平台=${d.platform} · python=${d.python} · 检测中…`;
    } catch (_) {}
  });
  es.addEventListener('mirror', (ev) => {
    try { upsertRow(JSON.parse(ev.data)); } catch (_) {}
  });
  es.addEventListener('log', (ev) => {
    try {
      const e = JSON.parse(ev.data);
      lastLogs.push(e);
      appendLog(e);
      $('#logCount').textContent = `(${lastLogs.length} 条)`;
    } catch (_) {}
  });
  es.addEventListener('done', (ev) => {
    try {
      const d = JSON.parse(ev.data);
      $('#summary').textContent =
        `可用 ${d.summary.ok} · 部分 ${d.summary.partial} · 故障 ${d.summary.fail}（共 ${d.summary.total}）`;
      if (d.compliance) $('#compliance').textContent = d.compliance;
    } catch (_) {}
    $('#status').textContent = '';
    $('#checkBtn').disabled = false;
    $('#downloadLog').hidden = false;
    es.close();
    es = null;
  });
  es.onerror = () => {
    $('#status').textContent = '连接中断，检测可能未完成';
    $('#checkBtn').disabled = false;
    if (es) { es.close(); es = null; }
  };
}

$('#checkBtn').addEventListener('click', check);

$('#downloadLog').addEventListener('click', () => {
  const text = lastLogs.map(logLineText).join('\n') + '\n';
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `conda-probe-${Date.now()}.log`;
  a.click();
  URL.revokeObjectURL(a.href);
});

loadMirrors(); // 页面加载只展示列表，不自动探测

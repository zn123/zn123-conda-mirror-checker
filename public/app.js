const $ = (s) => document.querySelector(s);
const tbody = document.querySelector('#result tbody');

function fmt(r) {
  if (!r) return '—';
  if (r.error) return r.error;
  return `${r.statusCode ?? '—'} · ${r.latency ?? 0}ms`;
}

function note(m) {
  const notes = [];
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

// 渲染探测结果
function renderResult(data) {
  tbody.innerHTML = '';
  data.mirrors.forEach((m) => {
    const tr = document.createElement('tr');
    tr.className = m.status;
    tr.innerHTML = `
      <td class="name">${m.name}<div class="base">${m.base}</div></td>
      <td>${fmt(m.repodata)}</td>
      <td>${fmt(m.pkg)}</td>
      <td>${m.latency}ms</td>
      <td><span class="badge ${m.status}">${label(m.status)}</span></td>
      <td class="note">${note(m)}</td>
    `;
    tbody.appendChild(tr);
  });
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

// 点击后才开始探测
async function check() {
  const platform = $('#platform').value;
  $('#status').textContent = '检测中…';
  $('#checkBtn').disabled = true;
  try {
    const resp = await fetch(`/api/check?platform=${encodeURIComponent(platform)}`);
    const data = await resp.json();
    renderResult(data);
    $('#status').textContent = '';
    $('#summary').textContent =
      `可用 ${data.summary.ok} · 部分 ${data.summary.partial} · 故障 ${data.summary.fail}（共 ${data.summary.total}）`;
  } catch (e) {
    $('#status').textContent = '检测失败: ' + e.message;
  } finally {
    $('#checkBtn').disabled = false;
  }
}

$('#checkBtn').addEventListener('click', check);
loadMirrors(); // 页面加载只展示列表，不自动探测

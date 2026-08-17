const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const PORT = process.env.PORT || 6688;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');

// 兜底包名：仅在 repodata 解析失败、拿不到真实包名时使用（win-64 的 python 3.12.13 build）
const PKG_FALLBACK = 'python-3.12.13-hd7b1df3_3.conda';

// 待检测的镜像源（base 指向各源的 pkgs/main 频道）
const MIRRORS = [
  { id: 'official', name: '官方 repo.anaconda.com', base: 'https://repo.anaconda.com/pkgs/main' },
  { id: 'bfsu',     name: '北京外国语 BFSU',          base: 'https://mirrors.bfsu.edu.cn/anaconda/pkgs/main' },
  { id: 'tuna',     name: '清华大学 tuna',            base: 'https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main' },
  { id: 'ustc',     name: '中科大 USTC',              base: 'https://mirrors.ustc.edu.cn/anaconda/pkgs/main' },
  { id: 'aliyun',   name: '阿里云',                   base: 'https://mirrors.aliyun.com/anaconda/pkgs/main' },
  { id: 'netease',  name: '网易 163',                 base: 'https://mirrors.163.com/anaconda/pkgs/main' },
  { id: 'huawei',   name: '华为云',                   base: 'https://mirrors.huaweicloud.com/anaconda/pkgs/main' },
  { id: 'sjtug',    name: '上海交大 SJTU',            base: 'https://mirrors.sjtug.sjtu.edu.cn/anaconda/pkgs/main' },
];

const TIMEOUT = 12000;       // 单请求超时(秒→在 curl 里用 /1000)

// 探测单个 URL（丢弃 body）：底层调用本机 curl（而非 Node 原生 https）。
// 原因：Cloudflare 等 CDN 会按 TLS 指纹拦截 Node 的请求（返回 403 Access Denied），
// 而 curl / conda(Python OpenSSL) 的指纹被放行。用 curl 才能反映 conda 真实可用的镜像状态。
// curl 自动跟随重定向(-L)，并输出 状态码|类型|耗时|大小|最终URL|重定向次数。
function probe(url, opts = {}) {
  return new Promise((resolve) => {
    const args = [
      '-sSL', '-o', os.devNull,
      '-w', '%{http_code}|%{content_type}|%{time_total}|%{size_download}|%{url_effective}|%{num_redirects}',
      '--max-time', String(TIMEOUT / 1000),
    ];
    if (opts.range) args.push('-r', opts.range);
    args.push(url);

    let settled = false;
    const done = (obj) => { if (settled) return; settled = true; clearTimeout(timer); resolve(obj); };
    const timer = setTimeout(() => done({
      ok: false, error: '超时', statusCode: null, contentType: '', finalUrl: url, latency: TIMEOUT, bytes: 0, numRedirects: 0,
    }), TIMEOUT + 3000);

    execFile('curl', args, { windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const raw = (stderr || err.message || 'curl 请求失败').toString().trim();
        const m = raw.match(/curl:\s*\(\d+\)\s*(.*)/);
        const friendly = m ? m[1].trim().slice(0, 90) : raw.replace(/^Command failed:\s*/, '').slice(0, 90);
        return done({ ok: false, error: friendly, statusCode: null, contentType: '', finalUrl: url, latency: 0, bytes: 0, numRedirects: 0 });
      }
      const p = String(stdout).trim().split('|');
      const statusCode = p[0] ? parseInt(p[0], 10) : null;
      const contentType = (p[1] || '').trim();
      const latency = Math.round((parseFloat(p[2]) || 0) * 1000);
      const bytes = parseInt(p[3], 10) || 0;
      const finalUrl = p[4] || url;
      const numRedirects = parseInt(p[5], 10) || 0;
      done({ ok: true, statusCode, contentType, finalUrl, latency, bytes, numRedirects });
    });
  });
}

// 下载 URL 的完整 body 到临时文件并返回元数据（用于 current_repodata.json 解析）。
// body 落盘到 tmpFile，避免几 MB 的 JSON 撑爆 execFile 的 stdout 缓冲；-w 元数据走 stdout。
// --compressed 让 curl 自动发 Accept-Encoding 并就地解压 gzip。
function fetchJson(url, tmpFile) {
  return new Promise((resolve) => {
    const args = [
      '-sSL', '--compressed', '-o', tmpFile,
      '-w', '%{http_code}|%{content_type}|%{time_total}|%{size_download}|%{url_effective}|%{num_redirects}',
      '--max-time', String(TIMEOUT / 1000),
    ];
    args.push(url);

    let settled = false;
    const done = (obj) => { if (settled) return; settled = true; clearTimeout(timer); resolve(obj); };
    const timer = setTimeout(() => done({
      ok: false, error: '超时', statusCode: null, contentType: '', finalUrl: url, latency: TIMEOUT, bytes: 0, numRedirects: 0, body: '',
    }), TIMEOUT + 3000);

    execFile('curl', args, { windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      let body = '';
      try { body = fs.readFileSync(tmpFile, 'utf8'); } catch (_) { /* 无文件则 body 为空 */ }
      fs.unlink(tmpFile, () => {}); // 清理临时文件（失败无害）

      if (err) {
        const raw = (stderr || err.message || 'curl 请求失败').toString().trim();
        const m = raw.match(/curl:\s*\(\d+\)\s*(.*)/);
        const friendly = m ? m[1].trim().slice(0, 90) : raw.replace(/^Command failed:\s*/, '').slice(0, 90);
        return done({ ok: false, error: friendly, statusCode: null, contentType: '', finalUrl: url, latency: 0, bytes: 0, numRedirects: 0, body });
      }
      const p = String(stdout).trim().split('|');
      const statusCode = p[0] ? parseInt(p[0], 10) : null;
      const contentType = (p[1] || '').trim();
      const latency = Math.round((parseFloat(p[2]) || 0) * 1000);
      const bytes = parseInt(p[3], 10) || 0;
      const finalUrl = p[4] || url;
      const numRedirects = parseInt(p[5], 10) || 0;
      done({ ok: true, statusCode, contentType, finalUrl, latency, bytes, numRedirects, body });
    });
  });
}

// 从 "python-3.12.13-hd7b1df3_3.conda" 提取版本号 "3.12.13"
function verOf(pkgName) {
  const m = String(pkgName).match(/^python-(\d+\.\d+\.\d+)/);
  return m ? m[1] : '';
}

// 比较两个 x.y.z 版本号
function cmpVersion(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] || 0, db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}

// 比较两个 x.y 主次版本号
function cmpMajorMinor(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  if (pa[0] !== pb[0]) return pa[0] - pb[0];
  return (pa[1] || 0) - (pb[1] || 0);
}

function majorMinor(v) {
  const m = String(v).split('.');
  return `${m[0]}.${m[1]}`;
}

// 从 repodata JSON 文本里解析出所有 python 包名，返回最新版本及对应包名。
// conda 的 repodata 有 packages(.tar.bz2) 与 packages.conda(.conda) 两个区，都查。
function parsePythonFromRepodata(body) {
  try {
    const obj = JSON.parse(body);
    const names = [];
    for (const section of ['packages', 'packages.conda']) {
      const pkgs = obj[section];
      if (pkgs && typeof pkgs === 'object') {
        for (const key of Object.keys(pkgs)) {
          if (/^python-\d+\.\d+\.\d+/.test(key)) names.push(key);
        }
      }
    }
    if (!names.length) return { latest: null, latestPkg: null };
    names.sort((a, b) => cmpVersion(verOf(a), verOf(b)));
    const latestPkg = names[names.length - 1];
    return { latest: verOf(latestPkg), latestPkg };
  } catch (_) {
    return { latest: null, latestPkg: null };
  }
}

// 包是否可下载（200/206，且不是 HTML）
function pkgGood(r) {
  if (!r.ok) return false;
  if (r.statusCode === 200 || r.statusCode === 206) return !/html/.test(r.contentType || '');
  return false;
}

// 生成"该源 python 最新版本 vs 用户目标版本"的备注
function buildPythonNote(latest, targetPy) {
  if (!latest) return '未解析到 python 包';
  const mm = majorMinor(latest);
  const t = String(targetPy || '3.12');
  const c = cmpMajorMinor(mm, t);
  if (c === 0) return `python ${latest} 已同步`;
  if (c > 0) return `源已更新至 ${latest}（未精确验证 ${t}）`;
  return `源最新 ${latest}，尚未同步到 ${t}`;
}

async function checkMirror(m, platform, targetPy) {
  const repodataUrl = `${m.base}/${platform}/current_repodata.json`;

  // ① 完整下载 current_repodata.json 并解析出该源 python 的真实版本与包名。
  //    能解析出合法 JSON 索引即视为"索引可用"。
  const tmpFile = path.join(os.tmpdir(), `zn123-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const repodata = await fetchJson(repodataUrl, tmpFile);

  let repodataOk = false;
  let pythonLatest = null, pythonLatestPkg = null;
  if (repodata.ok && (repodata.statusCode === 200 || repodata.statusCode === 206)) {
    try { JSON.parse(repodata.body || '{}'); repodataOk = true; } catch (_) { /* 非 JSON → 索引不可用 */ }
  }
  if (repodataOk) {
    const p = parsePythonFromRepodata(repodata.body);
    pythonLatest = p.latest;
    pythonLatestPkg = p.latestPkg;
  }

  // ② 用"该源真实存在的 python 包名"做下载探测（顺带修复跨平台 build hash 误判）。
  //    拿不到真实包名时回退到硬编码兜底包名。
  const pkgName = pythonLatestPkg || PKG_FALLBACK;
  const pkg = await probe(`${m.base}/${platform}/${pkgName}`, { range: '0-1023' });
  const pkgOk = pkgGood(pkg);

  // ③ 版本比对备注
  const pythonNote = buildPythonNote(pythonLatest, targetPy);

  let status = 'fail';
  if (repodataOk && pkgOk) status = 'ok';
  else if (repodataOk || pkgOk) status = 'partial';

  return {
    id: m.id, name: m.name, base: m.base,
    repodata: {
      statusCode: repodata.statusCode, contentType: repodata.contentType,
      latency: repodata.latency, error: repodata.error || null,
      isHtml: /html/.test(repodata.contentType || ''),
    },
    pkg: {
      statusCode: pkg.statusCode, contentType: pkg.contentType,
      latency: pkg.latency, error: pkg.error || null,
    },
    pythonLatest, pythonPkg: pkgName, pythonNote,
    repodataOk, pkgOk, status,
    latency: Math.max(repodata.latency || 0, pkg.latency || 0),
  };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const safe = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safe);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const u = req.url.split('?')[0];

  if (u === '/api/mirrors') {
    // 仅返回镜像源列表（不探测），供页面初始展示
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ mirrors: MIRRORS.map(({ id, name, base }) => ({ id, name, base })) }));
    return;
  }

  if (u === '/api/check') {
    const q = new URL(req.url, 'http://localhost').searchParams;
    const platform = q.get('platform') || 'win-64';
    const targetPy = q.get('python') || '3.12';
    try {
      const mirrors = await Promise.all(MIRRORS.map((m) => checkMirror(m, platform, targetPy).catch((e) => ({
        id: m.id, name: m.name, base: m.base,
        repodata: { statusCode: null, contentType: '', latency: 0, error: String((e && e.message) || e), isHtml: false },
        pkg: { statusCode: null, contentType: '', latency: 0, error: null },
        pythonLatest: null, pythonPkg: null, pythonNote: '探测异常',
        repodataOk: false, pkgOk: false, status: 'fail', latency: 0,
      }))));
      const summary = {
        ok: mirrors.filter((r) => r.status === 'ok').length,
        partial: mirrors.filter((r) => r.status === 'partial').length,
        fail: mirrors.filter((r) => r.status === 'fail').length,
        total: mirrors.length,
      };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ platform, python: targetPy, checkedAt: new Date().toISOString(), summary, mirrors }, null, 2));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`conda 镜像检测服务已启动: http://localhost:${PORT}`);
});

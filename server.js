const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const PORT = process.env.PORT || 6688;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');

// 探测用的一个真实包（与用户 create python=3.12 时拉取的包一致）
const PKG_FILE = 'python-3.12.13-hd7b1df3_3.conda';

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

// 探测单个 URL：底层调用本机 curl（而非 Node 原生 https）。
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

// 索引是否为合法 JSON（而非 404 / HTML 门户）。Range 探测会得到 206。
function isJsonRepodata(r) {
  if (!r.ok) return false;
  if (r.statusCode !== 200 && r.statusCode !== 206) return false;
  return /json/.test(r.contentType || '');
}

// 包是否可下载（200/206，且不是 HTML）
function pkgGood(r) {
  if (!r.ok) return false;
  if (r.statusCode === 200 || r.statusCode === 206) return !/html/.test(r.contentType || '');
  return false;
}

async function checkMirror(m, platform) {
  const repodataUrl = `${m.base}/${platform}/current_repodata.json`;
  const pkgUrl = `${m.base}/${platform}/${PKG_FILE}`;
  // 两者都用 Range 只取少量字节：既验证可达性与 content-type，又避免下载数 MB 的 repodata 触发超时
  const [repodata, pkg] = await Promise.all([
    probe(repodataUrl, { range: '0-0' }),
    probe(pkgUrl, { range: '0-1023' }),
  ]);

  const repodataOk = isJsonRepodata(repodata);
  const pkgOk = pkgGood(pkg);
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
    try {
      const mirrors = await Promise.all(MIRRORS.map((m) => checkMirror(m, platform).catch((e) => ({
        id: m.id, name: m.name, base: m.base,
        repodata: { statusCode: null, contentType: '', latency: 0, error: String((e && e.message) || e), isHtml: false },
        pkg: { statusCode: null, contentType: '', latency: 0, error: null },
        repodataOk: false, pkgOk: false, status: 'fail', latency: 0,
      }))));
      const summary = {
        ok: mirrors.filter((r) => r.status === 'ok').length,
        partial: mirrors.filter((r) => r.status === 'partial').length,
        fail: mirrors.filter((r) => r.status === 'fail').length,
        total: mirrors.length,
      };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ platform, checkedAt: new Date().toISOString(), summary, mirrors }, null, 2));
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

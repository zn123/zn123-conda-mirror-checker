const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const PORT = process.env.PORT || 6688;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');

// 硬编码的 python 包名表：按 [频道][平台][主次版本] 索引，值为该版本在官方源实际存在的包文件名。
// 这些文件名来自官方 current_repodata.json（运行时已核验真实存在），属 immutable 制品，验证一次长期有效。
// 探测时直接 HEAD 此文件名，不解析任何索引、不下载正文。
// 注意：官方源一旦为某版本发布新 build（如 3.12.13→3.12.14），旧 build 名可能从部分镜像移除而被探到 404；
//      属「最佳努力」——活跃版若遇 404 不一定代表镜像失效，可结合索引可达性判断。归档版(≤3.5)为 EOL 稳定名。
// 频道键：cf=conda-forge，main=defaults(pkgs/main)。
const PY_PKG = {
  cf: {
    'win-64': {
      '2.7': 'python-2.7.15-h2880e7c_1011_cpython.tar.bz2',
      '3.5': 'python-3.5.5-he025d50_2.tar.bz2',
      '3.6': 'python-3.6.15-h39d44d4_0_cpython.tar.bz2',
      '3.7': 'python-3.7.12-h900ac77_100_cpython.tar.bz2',
      '3.8': 'python-3.8.20-hfaddaf0_2_cpython.conda',
      '3.9': 'python-3.9.23-h8c5b53a_0_cpython.conda',
      '3.10': 'python-3.10.20-hc20f281_1_cpython.conda',
      '3.11': 'python-3.11.15-hb12b558_2_cpython.conda',
      '3.12': 'python-3.12.13-hb12b558_1_cpython.conda',
      '3.13': 'python-3.13.15-ha261ea0_0_cp313t.conda',
      '3.14': 'python-3.14.6-hb4b0029_2_cp314t.conda',
    },
    'linux-64': {
      '2.7': 'python-2.7.15-h9fef7bc_0.tar.bz2',
      '3.5': 'python-3.5.5-h5001a0f_2.tar.bz2',
      '3.6': 'python-3.6.15-hb7a2778_0_cpython.tar.bz2',
      '3.7': 'python-3.7.12-hf930737_100_cpython.tar.bz2',
      '3.8': 'python-3.8.20-h4a871b0_2_cpython.conda',
      '3.9': 'python-3.9.23-hc30ae73_0_cpython.conda',
      '3.10': 'python-3.10.20-h3c07f61_0_cpython.conda',
      '3.11': 'python-3.11.15-hd63d673_0_cpython.conda',
      '3.12': 'python-3.12.13-hd63d673_0_cpython.conda',
      '3.13': 'python-3.13.15-hb101c97_101_cp313.conda',
      '3.14': 'python-3.14.6-hf9ea5aa_1_cp314t.conda',
    },
    'osx-64': {
      '2.7': 'python-2.7.15-hd51d24c_1009.tar.bz2',
      '3.5': 'python-3.5.5-h5001a0f_2.tar.bz2',
      '3.6': 'python-3.6.15-haf480d7_0_cpython.tar.bz2',
      '3.7': 'python-3.7.12-hf3644f1_100_cpython.tar.bz2',
      '3.8': 'python-3.8.20-h4f978b9_2_cpython.conda',
      '3.9': 'python-3.9.23-h8a7f3fd_0_cpython.conda',
      '3.10': 'python-3.10.20-hea035f4_1_cpython.conda',
      '3.11': 'python-3.11.15-hd04fa83_2_cpython.conda',
      '3.12': 'python-3.12.13-hd04fa83_1_cpython.conda',
      '3.13': 'python-3.13.15-hb3481d1_1_cp313t.conda',
      '3.14': 'python-3.14.6-hcb74d6f_2_cp314t.conda',
    },
    'osx-arm64': {
      '2.7': null, '3.5': null, '3.6': null, '3.7': null,
      '3.8': 'python-3.8.20-h7d35d02_2_cpython.conda',
      '3.9': 'python-3.9.23-h7139b31_0_cpython.conda',
      '3.10': 'python-3.10.20-hac0b6dc_1_cpython.conda',
      '3.11': 'python-3.11.15-hd1323d7_2_cpython.conda',
      '3.12': 'python-3.12.13-hd1323d7_1_cpython.conda',
      '3.13': 'python-3.13.15-hf1cfe1e_101_cp313.conda',
      '3.14': 'python-3.14.6-hf4d206d_102_cp314.conda',
    },
  },
  main: {
    'win-64': {
      '2.7': 'python-2.7.18-hfb89ab9_0.conda',
      '3.5': 'python-3.5.6-he025d50_0.conda',
      '3.6': 'python-3.6.13-h3758d61_0.conda',
      '3.7': 'python-3.7.16-h6244533_0.conda',
      '3.8': 'python-3.8.20-h8205438_0.conda',
      '3.9': 'python-3.9.25-h716150d_1.conda',
      '3.10': 'python-3.10.20-hb00fc5c_1.conda',
      '3.11': 'python-3.11.15-hb00fc5c_1.conda',
      '3.12': 'python-3.12.13-hd7b1df3_3.conda',
      '3.13': 'python-3.13.15-h2e1fde4_102_cp313.conda',
      '3.14': 'python-3.14.7-h7ce57fb_101_cp314.conda',
    },
    'linux-64': {
      '2.7': 'python-2.7.18-ha1903f6_2.conda',
      '3.5': 'python-3.5.6-hc3d631a_0.conda',
      '3.6': 'python-3.6.13-hdb3f193_0.conda',
      '3.7': 'python-3.7.16-h7a1cb2a_0.conda',
      '3.8': 'python-3.8.20-he870216_0.conda',
      '3.9': 'python-3.9.25-h0dcde21_1.conda',
      '3.10': 'python-3.10.20-h741d88c_0.conda',
      '3.11': 'python-3.11.15-h741d88c_0.conda',
      '3.12': 'python-3.12.13-hc5f7cf0_3.conda',
      '3.13': 'python-3.13.15-h9631c4f_102_cp313.conda',
      '3.14': 'python-3.14.7-h863a04e_1_cp314t.conda',
    },
    'osx-64': {
      '2.7': 'python-2.7.18-hc817775_0.conda',
      '3.5': 'python-3.5.6-hc167b69_0.conda',
      '3.6': 'python-3.6.13-h88f2d9e_0.conda',
      '3.7': 'python-3.7.16-h218abb5_0.conda',
      '3.8': 'python-3.8.20-hce00570_0.conda',
      '3.9': 'python-3.9.23-hd8516d5_0.conda',
      '3.10': 'python-3.10.18-hc958d9f_0.conda',
      '3.11': 'python-3.11.13-hbff2529_0.conda',
      '3.12': 'python-3.12.9-hcd54a6c_0.conda',
      '3.13': 'python-3.13.5-h81a7116_100_cp313.conda',
      '3.14': null,
    },
    'osx-arm64': {
      '2.7': null, '3.5': null, '3.6': null, '3.7': null,
      '3.8': 'python-3.8.20-hb885b13_0.conda',
      '3.9': 'python-3.9.25-he39995d_1.conda',
      '3.10': 'python-3.10.20-h4f1bc5c_0.conda',
      '3.11': 'python-3.11.15-h4f1bc5c_0.conda',
      '3.12': 'python-3.12.13-hd7e0f33_1.conda',
      '3.13': 'python-3.13.15-hc2e2225_102_cp313.conda',
      '3.14': 'python-3.14.7-hedc06ab_101_cp314.conda',
    },
  },
};

// 待检测的镜像源。defaults 指向各源 pkgs/main（Anaconda 官方仓库，受商业许可约束）；
// cf 指向 conda-forge 频道（社区仓库，开源免费、授权规则不同）。
// 官方源 repo.anaconda.com 不托管 conda-forge，其 cf 走独立域名 conda.anaconda.org。
// 镜像源清单已抽到独立文件 mirrors.js（方便新增/调整），此处直接 require 读取。
const MIRRORS = require('./mirrors.js');

const TIMEOUT = 12000;       // 轻量探测（HEAD 请求）超时；不下载任何正文（repodata 与包都只发 HEAD），12s 足够

// 探测日志：每次 /api/check 落盘到 logs/ 目录，便于事后排查「哪个源为啥下不到」
const LOGS_DIR = path.join(ROOT, 'logs');
try { fs.mkdirSync(LOGS_DIR, { recursive: true }); } catch (_) {}

// 生成日志文件名时间戳片段：YYYYMMDD-HHMMSS
function tsStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// 日志收集器：既 push 进数组（落盘用），又通过 SSE 实时写出（前端实时面板用）
function makeLogger(res) {
  const arr = [];
  const push = (entry) => {
    entry.ts = new Date().toISOString();
    arr.push(entry);
    try { res.write(`event: log\ndata: ${JSON.stringify(entry)}\n\n`); } catch (_) { /* 连接已断，忽略 */ }
  };
  push.all = arr;
  return push;
}

// 单条日志的人读格式化（写文件用，方便 grep）
function fmtLogEntry(e) {
  const t = (e.ts || '').replace('T', ' ').replace('Z', '');
  switch (e.step) {
    case 'request': return `[${t}] REQUEST platform=${e.platform} python=${e.python} reqId=${e.reqId}`;
    case 'start': return `[${t}] [${e.mirror}] 开始探测 ${e.name || ''}`;
    case 'repodata':
      return `[${t}] [${e.mirror}] repodata -> ${e.statusCode ?? 'ERR'} (${e.latency}ms) ${e.ok ? 'OK' : 'FAIL'}${e.error ? ' err=' + e.error : ''} ${e.url}`;
    case 'parse':
      return `[${t}] [${e.mirror}] parse pythonLatest=${e.pythonLatest ?? 'null'} pkgCount=${e.pkgCount}`;
    case 'pkg':
      return `[${t}] [${e.mirror}] pkg(${e.pkgName}) -> ${e.statusCode ?? 'ERR'} (${e.latency}ms) ${e.ok ? 'OK' : 'FAIL'}${e.error ? ' err=' + e.error : ''}`;
    case 'result':
      return `[${t}] [${e.mirror}] RESULT ${e.status} ${e.pythonNote} (repodataOk=${e.repodataOk} pkgOk=${e.pkgOk} matched=${e.matched})`;
    default:
      return `[${t}] ${e.step} ${JSON.stringify(e)}`;
  }
}

// 把一次完整请求的所有日志写入 logs/requests-<ts>-<reqId>.log
function writeLogFile(reqId, platform, targetPy, channel, summary, logs) {
  const file = path.join(LOGS_DIR, `requests-${reqId}.log`);
  const lines = [
    `reqId=${reqId} platform=${platform} python=${targetPy} channel=${channel}`,
    `summary= ok:${summary.ok} partial:${summary.partial} fail:${summary.fail} total:${summary.total}`,
    '---',
  ];
  for (const e of logs) lines.push(fmtLogEntry(e));
  try { fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8'); } catch (_) { /* 落盘失败不阻断接口 */ }
  return file;
}

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
    if (opts.head) args.push('-I');
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

// fetchJson（下载完整 body 解析）已弃用：本工具改为纯 HEAD 探测，不再下载任何索引/包正文。

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

// parsePythonFromRepodata / matchPythonPkg / buildPythonNote 已弃用：探测不再解析索引，
// 包的版本与文件名直接来自硬编码 PY_PKG 表（见上方），故无需从 repodata 解析。

// 包是否可下载（200/206，且不是 HTML）
function pkgGood(r) {
  if (!r.ok) return false;
  if (r.statusCode === 200 || r.statusCode === 206) return !/html/.test(r.contentType || '');
  return false;
}

// matchPythonPkg 已弃用（见上方说明）。


// buildPythonNote 已弃用（见上方说明）。


// 归档版判定：python ≤ 3.5（含 2.7）视为历史归档包，很多国内镜像不主动同步
function isArchivePy(py) {
  return cmpMajorMinor(majorMinor(String(py || '3.12')), '3.5') <= 0;
}

// synthPkgName 已弃用（见上方说明）。包名统一来自硬编码 PY_PKG 表。

// 探测单个镜像的「某一个 channel」（defaults 或 conda-forge）。
// 简化方案（用户选定）：不下载任何正文，两步纯 HEAD：
//   ① 索引：HEAD repodata.json（200/206 且非 HTML = 索引可达，不下载 270MB 大文件）。
//   ② 包：HEAD 硬编码的 python 包名（PY_PKG[channelKey][platform][版本]，官方源核验真实存在）。
//   判定：索引可达 + 包可达 = ok；仅其一 = partial；都无 = fail。
//   归档版（python ≤ 3.5）：包未命中只标 partial，不因此判镜像 fail（很多镜像本就不同步历史归档包）。
async function probeOneChannel(m, platform, targetPy, baseUrl, channelKey, channelLabel, log) {
  log({ step: 'start', mirror: m.id, channel: channelLabel, name: m.name });
  const isArchive = isArchivePy(targetPy);

  // ① 索引：HEAD repodata.json（不下载正文）
  const repoUrl = `${baseUrl}/${platform}/repodata.json`;
  const repo = await probe(repoUrl, { head: true });
  const repodataOk = repo.ok && (repo.statusCode === 200 || repo.statusCode === 206) && !/html/.test(repo.contentType || '');

  // 重定向 / 代理检测：repodata HEAD 若发生跨域跳转（如 ustc→nju），说明源自身未托管、只是代理。
  const srcHost = (() => { try { return new URL(baseUrl).host; } catch (_) { return ''; } })();
  const dstHost = (() => { try { return new URL(repo.finalUrl || baseUrl).host; } catch (_) { return ''; } })();
  const redirected = (repo.numRedirects || 0) > 0;
  const isProxy = redirected && dstHost && srcHost && dstHost !== srcHost;
  const proxyTarget = isProxy ? repo.finalUrl : null;
  const proxyNote = isProxy
    ? `源为跳转代理，实际指向 ${dstHost}`
    : (redirected ? `已内部重定向（${dstHost}）` : null);

  log({
    step: 'repodata', mirror: m.id, channel: channelLabel, url: repoUrl,
    statusCode: repo.statusCode, contentType: repo.contentType,
    latency: repo.latency, bytes: repo.bytes, ok: repodataOk,
    error: repo.error || null, finalUrl: repo.finalUrl,
    numRedirects: repo.numRedirects, redirected: isProxy,
    file: 'repodata.json', onlyHead: true, parsed: false,
  });

  // ② 包：从硬编码表取真实包名，HEAD 它
  const minor = majorMinor(String(targetPy || '3.12'));
  const pkgName = (PY_PKG[channelKey] && PY_PKG[channelKey][platform] && PY_PKG[channelKey][platform][minor]) || null;
  let pkg;
  if (pkgName) {
    const pkgUrl = `${baseUrl}/${platform}/${pkgName}`;
    pkg = await probe(pkgUrl, { head: true });
  } else {
    pkg = { ok: false, statusCode: null, contentType: '', latency: 0, bytes: 0,
      error: `无硬编码包名（${channelLabel} ${platform} python ${targetPy} 不在精简索引）`, finalUrl: '', numRedirects: 0 };
  }
  const pkgOk = pkgGood(pkg);
  // 包重定向（302 跳官方）→ 视作该镜像不含此包，不误升状态
  const pkgRedirected = (pkg.numRedirects || 0) > 0 && !(pkg.statusCode === 200 || pkg.statusCode === 206);

  log({
    step: 'pkg', mirror: m.id, channel: channelLabel, url: pkgName ? `${baseUrl}/${platform}/${pkgName}` : '', pkgName,
    statusCode: pkg.statusCode, contentType: pkg.contentType,
    latency: pkg.latency, bytes: pkg.bytes, ok: pkgOk, error: pkg.error || null,
    nameSynthesized: false, redirected: (pkg.numRedirects || 0) > 0,
  });

  // ③ 版本对照备注（区分归档版）
  let pythonNote;
  if (isArchive) {
    if (pkgOk) pythonNote = `【归档包】python ${targetPy} 已同步`;
    else if (!pkgName) pythonNote = `【归档包】python ${targetPy} 无硬编码包名，跳过包探测`;
    else pythonNote = `【归档包】python ${targetPy} 未命中（部分镜像不含历史归档包，不代表镜像失效）`;
  } else {
    if (pkgName && pkgOk) pythonNote = `python ${targetPy} 包可达`;
    else if (pkgName && !pkgOk) {
      if (repodataOk) pythonNote = `python ${targetPy} 包 ${pkg.statusCode != null ? pkg.statusCode : '不可达'}（索引可达，但包 HEAD 未通过）`;
      else pythonNote = `python ${targetPy} 包 ${pkg.statusCode != null ? pkg.statusCode : '不可达'}（索引 HEAD 也未通过，镜像可能整体不可达）`;
    } else pythonNote = `python ${targetPy} 无硬编码包名，仅验证索引可达`;
  }
  if (pkgRedirected) pythonNote += '（包跳转代理/官方，镜像不含此包）';

  // ④ 状态
  let status = 'fail';
  if (repodataOk && pkgOk) status = 'ok';
  else if (repodataOk || pkgOk) status = 'partial';
  if (isArchive && repodataOk && !pkgOk) status = 'partial';

  log({ step: 'result', mirror: m.id, channel: channelLabel, status, pythonNote, repodataOk, pkgOk, matched: !!pkgName, proxy: isProxy, isArchive });

  return {
    repodataFile: 'repodata.json',
    repodataParsed: false,
    repodata: {
      statusCode: repo.statusCode, contentType: repo.contentType,
      latency: repo.latency, error: repo.error || null,
      isHtml: /html/.test(repo.contentType || ''),
      finalUrl: repo.finalUrl, numRedirects: repo.numRedirects,
    },
    pkg: { statusCode: pkg.statusCode, contentType: pkg.contentType, latency: pkg.latency, error: pkg.error || null },
    pythonLatest: targetPy, pythonPkg: pkgName, pythonNote,
    repodataOk, pkgOk, status, isArchive, nameSynthesized: false,
    latency: Math.max(repo.latency || 0, pkg.latency || 0),
    redirected: isProxy, proxyTarget, proxyNote,
  };
}

// 探测单个镜像（按 channel 参数：defaults / conda-forge / both）
async function checkMirror(m, platform, targetPy, channel, log) {
  if (channel === 'conda-forge') {
    const c = await probeOneChannel(m, platform, targetPy, m.cf, 'cf', 'conda-forge', log);
    return { id: m.id, name: m.name, base: m.cf, channel, ...c };
  }
  if (channel === 'both') {
    const d = await probeOneChannel(m, platform, targetPy, m.base, 'main', 'defaults', log);
    const c = await probeOneChannel(m, platform, targetPy, m.cf, 'cf', 'conda-forge', log);
    // 两个频道任一可用即不算全挂；都可用才算 ok，否则 partial
    const status = (d.status === 'ok' || c.status === 'ok')
      ? ((d.status === 'ok' && c.status === 'ok') ? 'ok' : 'partial')
      : 'fail';
    return {
      id: m.id, name: m.name, base: m.base, channel,
      ...d, status, pythonNote: d.pythonNote,
      channels: {
        defaults: { status: d.status, pythonNote: d.pythonNote, repodataOk: d.repodataOk, pkgOk: d.pkgOk, redirected: d.redirected },
        condaforge: { status: c.status, pythonNote: c.pythonNote, repodataOk: c.repodataOk, pkgOk: c.pkgOk, redirected: c.redirected },
      },
    };
  }
  // 默认 defaults
  const d = await probeOneChannel(m, platform, targetPy, m.base, 'main', 'defaults', log);
  return { id: m.id, name: m.name, base: m.base, channel: 'defaults', ...d };
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
    res.end(JSON.stringify({ mirrors: MIRRORS.map(({ id, name, base, cf, deprecated }) => ({ id, name, base, cf, deprecated: !!deprecated })) }));
    return;
  }

  if (u === '/api/check') {
    const q = new URL(req.url, 'http://localhost').searchParams;
    const platform = q.get('platform') || 'win-64';
    const targetPy = q.get('python') || '3.12';
    const channel = ['defaults', 'conda-forge', 'both'].includes(q.get('channel')) ? q.get('channel') : 'defaults';

    // 改为 SSE：实时逐条推送探测日志(log) + 每源完成推结果(mirror) + 结束推 done
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');

    const reqId = `${tsStamp()}-${Math.random().toString(36).slice(2, 8)}`;
    const logger = makeLogger(res);
    logger({ step: 'request', reqId, platform, python: targetPy, channel });
    res.write(`event: meta\ndata: ${JSON.stringify({ platform, python: targetPy, channel, reqId })}\n\n`);

    const results = [];
    await Promise.all(MIRRORS.map((m) => {
      // 废弃源：仅展示、不参与探测，直接发一条 deprecated 状态的 mirror 事件
      if (m.deprecated) {
        const r = {
          id: m.id, name: m.name, base: m.base, channel, deprecated: true,
          repodata: { statusCode: null, contentType: '', latency: 0, error: null, isHtml: false },
          pkg: { statusCode: null, contentType: '', latency: 0, error: null },
          pythonLatest: null, pythonPkg: null, pythonNote: '已废弃，不参与探测',
          repodataOk: false, pkgOk: false, status: 'deprecated', latency: 0,
        };
        results.push(r);
        res.write(`event: mirror\ndata: ${JSON.stringify(r)}\n\n`);
        return Promise.resolve();
      }
      return checkMirror(m, platform, targetPy, channel, logger)
        .then((r) => {
          results.push(r);
          res.write(`event: mirror\ndata: ${JSON.stringify(r)}\n\n`);
        })
        .catch((e) => {
          const r = {
            id: m.id, name: m.name, base: m.base, channel,
            repodata: { statusCode: null, contentType: '', latency: 0, error: String((e && e.message) || e), isHtml: false },
            pkg: { statusCode: null, contentType: '', latency: 0, error: null },
            pythonLatest: null, pythonPkg: null, pythonNote: '探测异常',
            repodataOk: false, pkgOk: false, status: 'fail', latency: 0,
          };
          results.push(r);
          res.write(`event: mirror\ndata: ${JSON.stringify(r)}\n\n`);
        });
    }));

    const summary = {
      ok: results.filter((r) => r.status === 'ok').length,
      partial: results.filter((r) => r.status === 'partial').length,
      fail: results.filter((r) => r.status === 'fail').length,
      deprecated: results.filter((r) => r.status === 'deprecated').length,
      total: results.length,
    };
    // D. 合规提示：defaults 频道受 Anaconda 商业许可约束，conda-forge 不受限
    const compliance = 'defaults 频道（Anaconda 官方仓库）受 Anaconda 商业许可约束：≥200 人组织的商业使用需购买授权，教育/个人/<200 人可免费。合规敏感场景建议改用 conda-forge 频道（micromamba / miniforge），不受该许可约束。';
    const logFile = writeLogFile(reqId, platform, targetPy, channel, summary, logger.all);
    logger({ step: 'done', reqId, logFile, summary });
    res.write(`event: done\ndata: ${JSON.stringify({ summary, reqId, logFile, compliance, channel })}\n\n`);
    res.end();
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`conda 镜像检测服务已启动: http://localhost:${PORT}`);
});

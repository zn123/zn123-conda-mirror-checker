# zn123-conda-mirror-checker

一个**零依赖**（仅用 Node 内置模块）的 Web 小工具，用来实时查看各 conda 镜像源的可用性：索引是否能拉到、包是否真能下载。

> 背景：排查 `conda create` 报 `502 BAD GATEWAY` / `SSL module not available` 时，发现国内多个教育镜像后端时好时坏、且个别商业源返回的是网页门户而非 conda 索引。这个工具把"到底哪个源能用"这件事变得一眼可见。

## 功能

- 在浏览器里以表格展示 9 个 conda 镜像源的状态（绿 / 黄 / 红）。
- 每个镜像同时做三件事：
  1. 完整拉取 `current_repodata.json`，验证是否返回合法 JSON（识别 404 / HTML 门户）；
  2. 解析该源 python 的真实版本与包名，对该真实包发 Range 请求验证能否下载（识别 502 / 429 / 403）；
  3. 对照你选择的 Python 版本，标注该源是否已同步。
- 支持切换平台：`win-64` / `linux-64` / `osx-64` / `osx-arm64`。
- 支持选择 Python 版本：`3.8` / `3.10` ~ `3.14`，精确判断该源是否含此版本、且该版本包能否下载。
- 支持切换**频道**：`defaults`（Anaconda 官方仓库，受商业许可约束）/ `conda-forge`（社区仓库，开源免费）/ `both`（两者都测，结果含双频道子状态）。两类频道授权规则与国内同步情况差异很大，应分开看。
- **跳转代理检测**：探测会识别跨域 302 跳转（如中科大 USTC 已不再自维护 defaults，会 302 跳转到南京大学 NJU）。检测到代理时，表格该行打「↪代理」徽标并在备注标明实际指向，避免把代理误报成「源本身可用」。
- **合规提示**：页面底部固定提示 defaults 频道受 Anaconda 商业许可约束（≥200 人组织商业使用需授权；教育/个人/<200 人免费），合规敏感场景建议改用 conda-forge 频道（micromamba / miniforge）。
- 页面加载**先列出全部镜像源（待检测状态）**，点击「开始检测」按钮才发起探测，不会一打开就自动打网络（后端对应 `GET /api/mirrors` 仅返回列表、不探测）。
- 状态判定：
  - ✅ **ok（可用）**：索引可用、你选的 Python 版本存在、且该版本包能下载；
  - ⚠️ **partial（部分）**：索引与包可用但缺你选的版本（尚未同步/旧版已淘汰），或索引与包仅一项可用；
  - ❌ **fail（故障）**：索引与包都不可用（502 / 超时 / HTML 门户等）。
- **探测日志**：页面底部实时滚动展示每个源每一步（索引 / 解析 / 包下载）的 URL、状态码、耗时、版本匹配结论与错误文案；同时后端把每次探测完整写入 `logs/requests-<时间戳>.log`，方便事后排查「到底哪个源为啥下不到」。

## 环境要求

- Node.js（任意较新版本，建议 ≥ 16；开发用 v22 验证通过）。
- 系统已安装 **curl**（Windows 上随 Git for Windows / 多数开发环境自带）。探测底层调用本机 `curl`，而非 Node 原生 HTTPS——原因是 Cloudflare 等 CDN 会按 TLS 指纹拦截 Node 请求（返回 403），而 curl / conda 的指纹被放行，用 curl 才能反映 conda 真实可用的镜像状态。

## 启动

```bash
cd zn123_conda_test
node server.js
# 或： npm start
```

默认监听 `http://localhost:6688`（可用环境变量覆盖：`PORT=8080 node server.js`）。

启动后在浏览器打开 **http://localhost:6688** 即可。

## 接口

### `GET /api/check?platform=win-64&python=3.12`

**Server-Sent Events（SSE，`text/event-stream`）** 流式返回，逐条推送探测进度，便于前端实时展示日志面板。参数：`platform`（可选，默认 `win-64`，取值 `win-64`/`linux-64`/`osx-64`/`osx-arm64`）、`python`（可选，默认 `3.12`，取值 `3.8` / `3.10` ~ `3.14`）、`channel`（可选，默认 `defaults`，取值 `defaults` / `conda-forge` / `both`）。

依次推送以下事件类型：

- `meta`：`{ platform, python, channel, reqId }` —— 本次请求元信息；
- `mirror`：单个镜像探测完成的结果对象（结构见下），**逐个推送**，前端据此实时更新表格对应行；
- `log`：单条探测日志 `{ ts, step, mirror?, channel?, url?, statusCode?, latency?, ok?, error?, finalUrl?, numRedirects?, redirected?, ... }`，`step` 取值 `request` / `start` / `repodata` / `parse` / `pkg` / `result` / `done`；
- `done`：`{ summary, reqId, logFile, compliance, channel }` —— 汇总、本次落盘日志文件路径，以及 `compliance` 合规提示文案。

`mirror` 事件携带的对象结构（即下方示例）：

```json
{
  "id": "official",
  "name": "官方 repo.anaconda.com",
  "base": "https://repo.anaconda.com/pkgs/main",
  "channel": "defaults",
  "repodata": { "statusCode": 200, "contentType": "application/json", "latency": 800, "error": null, "isHtml": false, "finalUrl": "https://repo.anaconda.com/pkgs/main/current_repodata.json", "numRedirects": 0 },
  "pkg":       { "statusCode": 206, "contentType": "application/x-conda", "latency": 1200, "error": null },
  "repodataOk": true,
  "pkgOk": true,
  "status": "ok",
  "latency": 1200,
  "pythonLatest": "3.14.7",
  "pythonPkg": "python-3.12.13-h63b1a2d_1.conda",
  "pythonNote": "python 3.12.13 已同步",
  "redirected": false,
  "proxyTarget": null,
  "proxyNote": null
}
```

`channel=both` 时，对象额外携带 `channels` 字段（双频道子状态）：

```json
{
  "channels": {
    "defaults":   { "status": "ok", "pythonNote": "python 3.12.13 已同步", "repodataOk": true, "pkgOk": true, "redirected": false },
    "condaforge": { "status": "ok", "pythonNote": "python 3.12.13 已同步", "repodataOk": true, "pkgOk": true, "redirected": false }
  }
}
```

字段说明：
- `repodata` / `pkg`：索引与包的探测详情；`statusCode` 为 HTTP 状态码，`latency` 为毫秒，`error` 为失败时的友好文案（如 `超时`、`Could not resolve host`）。
- `isHtml`：当 `repodata` 实际返回 HTML 门户页时为 `true`（坏源标志，如华为云）。
- `repodata.finalUrl` / `repodata.numRedirects`：索引请求的最终 URL 与跳转次数，用于**跳转代理检测**。
- `redirected` / `proxyTarget` / `proxyNote`：当发生跨域 302（如 USTC → NJU）时为 `true` 并标注实际指向；否则为 `false` / `null` / `null`。
- `pythonLatest`：从该源 `current_repodata.json` 解析出的 python **最新版本号**（如 `3.14.7`）；解析失败为 `null`。
- `pythonPkg`：下载探测所用的包名——**匹配你所选版本**；该源无此版本时回退为最新版包，再退为内置兜底包名。
- `pythonNote`：该源是否含你选版本的对照结论（`python 3.12.13 已同步` / `无 3.8（源最新 3.14.7，旧版可能已淘汰）` / `无 3.14（源最新 3.12.13，尚未同步）`）。
- `channels`：仅 `channel=both` 时存在，分别给出 defaults 与 conda-forge 两频道的子状态。
- `compliance`（`done` 事件字段）：defaults 频道受 Anaconda 商业许可约束的提示文案。
- `logFile`（`done` 事件字段）：本次探测完整日志的落盘绝对路径，文件为纯文本（每行一条 `step`），含每步 URL / 状态码 / 耗时，可直接 `grep` 排查。

## 项目结构

```
zn123_conda_test/
├── package.json        # 启动脚本：npm start
├── server.js           # 零依赖后端：静态服务 + /api/check(SSE) 探测接口（底层调用 curl）
├── public/
│   ├── index.html      # 中文界面（含探测日志面板）
│   ├── style.css       # 绿 / 黄 / 红状态配色 + 日志面板样式
│   └── app.js          # 通过 EventSource 消费 SSE，实时渲染表格与日志
├── logs/               # 探测日志（运行时生成，每次 /api/check 一份 requests-<时间戳>.log）
└── README.md
```

## 待检测的镜像源

| id | 名称 | base（defaults 频道） |
|---|---|---|
| official | 官方 repo.anaconda.com | https://repo.anaconda.com/pkgs/main |
| bfsu | 北京外国语 BFSU | https://mirrors.bfsu.edu.cn/anaconda/pkgs/main |
| tuna | 清华大学 tuna | https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main |
| ustc | 中科大 USTC（跳转代理） | https://mirrors.ustc.edu.cn/anaconda/pkgs/main |
| nju | 南京大学 NJU | https://mirror.nju.edu.cn/anaconda/pkgs/main |
| aliyun | 阿里云 | https://mirrors.aliyun.com/anaconda/pkgs/main |
| netease | 网易 163（疑似失效） | https://mirrors.163.com/anaconda/pkgs/main |
| huawei | 华为云 | https://mirrors.huaweicloud.com/anaconda/pkgs/main |
| sjtug | 上海交大 SJTU | https://mirrors.sjtug.sjtu.edu.cn/anaconda/pkgs/main |

> 每个源还有独立的 `conda-forge` 频道地址（`cloud/conda-forge` 或官方源的 `conda.anaconda.org/conda-forge`），由 `channel=conda-forge` / `both` 触发探测。

要增删镜像，编辑 `server.js` 顶部的 `MIRRORS` 数组即可。

## 实现要点（踩过的坑）

- **用 curl 而非 Node 原生 HTTPS**：Cloudflare 等 CDN 会按 TLS 指纹拦截 Node 请求，curl / conda 的指纹放行。
- **用 `os.devNull` 而非 `/dev/null`**：Windows 下 `curl.exe` 不认 `/dev/null`，必须用 Node 的跨平台空设备。
- **`current_repodata.json` 完整下载、包探测用 `Range`**：repodata 需完整 JSON 才能解析出 python 真实版本与包名，用 curl 的 `--compressed` 就地解压 gzip（几 MB）；包探测仍用 `Range: 0-1023` 只取少量字节即可验证可下载性。
- **包名从 repodata 动态解析，而非硬编码**：包文件名的 build 段（如 `hd7b1df3_3`）随平台/构建而变，硬编码会导致切平台时误判 404；改从该源 `current_repodata.json` 的 `packages` / `packages.conda` 区解析出真实包名，并按用户所选主次版本精确匹配（`current_repodata` 实际保留 2.7~3.14 多个 python 版本，并非只有最新版）。
- **每个探测带硬性兜底定时器**：个别镜像卡死（如 TLS 握手挂起）不会拖垮整页。
- **探测日志双通道**：后端用 SSE 实时推送每步 `log` 事件（前端实时面板），并在请求结束把完整日志写入 `logs/requests-<时间戳>.log`（纯文本，方便 grep 排查）；`checkMirror` 每步通过日志收集器同时落盘与推送，做到「既实时刷屏、又留档可查」。
- **跳转代理检测**：curl 用 `-sSL` 静默跟随重定向，若不显式暴露 `url_effective` / `num_redirects` 会把代理误报成「源本身可用」。因此 `probeOneChannel` 在索引探测后比较源 host 与最终 host，跨域（如 USTC → NJU）即标 `redirected` 并在结果/日志/徽标三处标注，状态不因此误升。
- **两类频道分开探测**：`defaults`（Anaconda 官方仓库，受商业许可约束）与 `conda-forge`（社区仓库，开源免费）的国内同步情况差异很大，故 `MIRRORS` 每项带 `base`+`cf` 双地址，`channel` 参数决定探测哪类；`both` 时各探一次并合并出双频道子状态。
- **友好错误文案**：curl 出错时用正则提取 `curl: (N) message`，而非把整条命令串暴露给用户。

## License

MIT

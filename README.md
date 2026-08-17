# zn123-conda-mirror-checker

一个**零依赖**（仅用 Node 内置模块）的 Web 小工具，用来实时查看各 conda 镜像源的可用性：索引是否能拉到、包是否真能下载。

> 背景：排查 `conda create` 报 `502 BAD GATEWAY` / `SSL module not available` 时，发现国内多个教育镜像后端时好时坏、且个别商业源返回的是网页门户而非 conda 索引。这个工具把"到底哪个源能用"这件事变得一眼可见。

## 功能

- 在浏览器里以表格展示 8 个 conda 镜像源的状态（绿 / 黄 / 红）。
- 每个镜像同时做三件事：
  1. 完整拉取 `current_repodata.json`，验证是否返回合法 JSON（识别 404 / HTML 门户）；
  2. 解析该源 python 的真实版本与包名，对该真实包发 Range 请求验证能否下载（识别 502 / 429 / 403）；
  3. 对照你选择的 Python 版本，标注该源是否已同步。
- 支持切换平台：`win-64` / `linux-64` / `osx-64` / `osx-arm64`。
- 支持选择 Python 版本：`3.10` ~ `3.14`，探测结果对照该版本标注各源同步进度。
- 页面加载**先列出全部镜像源（待检测状态）**，点击「开始检测」按钮才发起探测，不会一打开就自动打网络（后端对应 `GET /api/mirrors` 仅返回列表、不探测）。
- 状态判定：
  - ✅ **ok（可用）**：索引和包都正常；
  - ⚠️ **partial（部分）**：索引可用但包不行（如包被限流 429/403）；
  - ❌ **fail（故障）**：索引或包都不可用（502 / 超时 / HTML 门户等）。

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

返回各镜像的探测结果（JSON）。`platform` 可选值：`win-64`（默认）、`linux-64`、`osx-64`、`osx-arm64`；`python` 可选值：`3.10` ~ `3.14`（默认 `3.12`）。

响应结构：

```json
{
  "platform": "win-64",
  "checkedAt": "2026-08-17T11:20:00.000Z",
  "summary": { "ok": 1, "partial": 2, "fail": 5, "total": 8 },
  "mirrors": [
    {
      "id": "official",
      "name": "官方 repo.anaconda.com",
      "base": "https://repo.anaconda.com/pkgs/main",
      "repodata": { "statusCode": 200, "contentType": "application/json", "latency": 800, "error": null, "isHtml": false },
      "pkg":       { "statusCode": 206, "contentType": "application/x-conda", "latency": 1200, "error": null },
      "repodataOk": true,
      "pkgOk": true,
      "status": "ok",
      "latency": 1200,
      "pythonLatest": "3.14.7",
      "pythonPkg": "python-3.14.7-h7ce57fb_101_cp314.conda",
      "pythonNote": "源已更新至 3.14.7（未精确验证 3.12）"
    }
  ]
}
```

字段说明：
- `repodata` / `pkg`：索引与包的探测详情；`statusCode` 为 HTTP 状态码，`latency` 为毫秒，`error` 为失败时的友好文案（如 `超时`、`Could not resolve host`）。
- `isHtml`：当 `repodata` 实际返回 HTML 门户页时为 `true`（坏源标志，如华为云）。
- `pythonLatest`：从该源 `current_repodata.json` 解析出的 python **最新版本号**（如 `3.14.7`）；解析失败为 `null`。
- `pythonPkg`：该源真实存在的 python 包文件名（下载探测即针对此包）；解析失败时回退为内置兜底包名。
- `pythonNote`：该源 python 最新版本与你所选版本的对照结论（`已同步` / `源已更新至 X` / `源最新 X，尚未同步到 Y`）。

## 项目结构

```
zn123_conda_test/
├── package.json        # 启动脚本：npm start
├── server.js           # 零依赖后端：静态服务 + /api/check 探测接口（底层调用 curl）
├── public/
│   ├── index.html      # 中文界面
│   ├── style.css       # 绿 / 黄 / 红状态配色
│   └── app.js          # 拉取接口、渲染表格、支持平台切换与重新检测
└── README.md
```

## 待检测的镜像源

| id | 名称 | base |
|---|---|---|
| official | 官方 repo.anaconda.com | https://repo.anaconda.com/pkgs/main |
| bfsu | 北京外国语 BFSU | https://mirrors.bfsu.edu.cn/anaconda/pkgs/main |
| tuna | 清华大学 tuna | https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main |
| ustc | 中科大 USTC | https://mirrors.ustc.edu.cn/anaconda/pkgs/main |
| aliyun | 阿里云 | https://mirrors.aliyun.com/anaconda/pkgs/main |
| netease | 网易 163 | https://mirrors.163.com/anaconda/pkgs/main |
| huawei | 华为云 | https://mirrors.huaweicloud.com/anaconda/pkgs/main |
| sjtug | 上海交大 SJTU | https://mirrors.sjtug.sjtu.edu.cn/anaconda/pkgs/main |

要增删镜像，编辑 `server.js` 顶部的 `MIRRORS` 数组即可。

## 实现要点（踩过的坑）

- **用 curl 而非 Node 原生 HTTPS**：Cloudflare 等 CDN 会按 TLS 指纹拦截 Node 请求，curl / conda 的指纹放行。
- **用 `os.devNull` 而非 `/dev/null`**：Windows 下 `curl.exe` 不认 `/dev/null`，必须用 Node 的跨平台空设备。
- **`current_repodata.json` 完整下载、包探测用 `Range`**：repodata 需完整 JSON 才能解析出 python 真实版本与包名，用 curl 的 `--compressed` 就地解压 gzip（几 MB）；包探测仍用 `Range: 0-1023` 只取少量字节即可验证可下载性。
- **包名从 repodata 动态解析，而非硬编码**：包文件名的 build 段（如 `hd7b1df3_3`）随平台/构建而变，硬编码会导致切平台时误判 404；改从该源 `current_repodata.json` 的 `packages` / `packages.conda` 区解析出真实包名。
- **每个探测带硬性兜底定时器**：个别镜像卡死（如 TLS 握手挂起）不会拖垮整页。
- **友好错误文案**：curl 出错时用正则提取 `curl: (N) message`，而非把整条命令串暴露给用户。

## License

MIT

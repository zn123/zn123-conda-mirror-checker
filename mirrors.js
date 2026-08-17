// 镜像源清单（MIRRORS）
// ─────────────────────────────────────────────────────────────
// 新增 / 调整镜像：直接增删下面的对象即可，server.js 通过 require 读取本文件。
//
// 字段说明：
//   id   唯一标识（字母数字，用于前端匹配与日志）
//   name 展示名（前端表格第一列）
//   base defaults 频道地址（Anaconda 官方仓库，受商业许可约束）
//   cf   conda-forge 频道地址（社区仓库，开源免费、授权规则不同）
//   deprecated 可选；设为 true 时该源仅在界面显示（标注「已废弃」），不参与实际探测
//
// 标记某源为「废弃只显示、不探测」：加 deprecated: true 即可；若要彻底移除，直接删对象。
// 注意：官方源 repo.anaconda.com 不托管 conda-forge，其 cf 走独立域名 conda.anaconda.org。
//       ustc 的 defaults(pkgs/main) 会 302 跳转代理到南京大学 NJU，运行时由重定向检测自动标注
//       「↪ 源为跳转代理」，并据此在「both」模式下归类为「⚠️ 仅社区源可用」（defaults 非本源自托管）。
//       当前列表不含 deprecated 源；如需恢复历史源（如 netease），可重新加入并视情况标记 deprecated。
// ─────────────────────────────────────────────────────────────

const MIRRORS = [
  { id: 'official', name: '官方 repo.anaconda.com', base: 'https://repo.anaconda.com/pkgs/main',        cf: 'https://conda.anaconda.org/conda-forge' },
  { id: 'bfsu',     name: '北京外国语 BFSU',          base: 'https://mirrors.bfsu.edu.cn/anaconda/pkgs/main',  cf: 'https://mirrors.bfsu.edu.cn/anaconda/cloud/conda-forge' },
  { id: 'tuna',     name: '清华大学 TUNA（首选）',    base: 'https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main', cf: 'https://mirrors.tuna.tsinghua.edu.cn/anaconda/cloud/conda-forge' },
  { id: 'ustc',     name: '中科大 USTC ⚠️ defaults跳转海外，仅conda-forge可用', base: 'https://mirrors.ustc.edu.cn/anaconda/pkgs/main',  cf: 'https://mirrors.ustc.edu.cn/anaconda/cloud/conda-forge' },
  { id: 'nju',      name: '南京大学 NJU',             base: 'https://mirror.nju.edu.cn/anaconda/pkgs/main',  cf: 'https://mirror.nju.edu.cn/anaconda/cloud/conda-forge' },
  { id: 'zju',      name: '浙江大学 ZJU',             base: 'https://mirrors.zju.edu.cn/anaconda/pkgs/main',  cf: 'https://mirrors.zju.edu.cn/anaconda/cloud/conda-forge' },
  { id: 'lzu',      name: '兰州大学 LZU（西北线路优选）', base: 'https://mirror.lzu.edu.cn/anaconda/pkgs/main', cf: 'https://mirror.lzu.edu.cn/anaconda/cloud/conda-forge' },
  { id: 'aliyun',   name: '阿里云',                   base: 'https://mirrors.aliyun.com/anaconda/pkgs/main',   cf: 'https://mirrors.aliyun.com/anaconda/cloud/conda-forge' },
  { id: 'huawei',   name: '华为云',                   base: 'https://mirrors.huaweicloud.com/anaconda/pkgs/main', cf: 'https://mirrors.huaweicloud.com/anaconda/cloud/conda-forge' },
  { id: 'sjtug',    name: '上海交大 SJTU',            base: 'https://mirror.sjtu.edu.cn/anaconda/pkgs/main', cf: 'https://mirror.sjtu.edu.cn/anaconda/cloud/conda-forge' },
  { id: 'netease',  name: '网易 163（已废弃）',        base: 'https://mirrors.163.com/anaconda/pkgs/main',     cf: 'https://mirrors.163.com/anaconda/cloud/conda-forge',deprecated: true },
];

module.exports = MIRRORS;

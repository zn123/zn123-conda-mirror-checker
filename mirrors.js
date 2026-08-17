// 镜像源清单（MIRRORS）
// ─────────────────────────────────────────────────────────────
// 新增 / 调整镜像：直接增删下面的对象即可，server.js 通过 require 读取本文件。
//
// 字段说明：
//   id   唯一标识（字母数字，用于前端匹配与日志）
//   name 展示名（前端表格第一列）
//   base defaults 频道地址（Anaconda 官方仓库，受商业许可约束）
//   cf   conda-forge 频道地址（社区仓库，开源免费、授权规则不同）
//
// 临时停用某源：把对应行用 // 注释掉即可（见下方 ustc / netease 示例）。
// 注意：官方源 repo.anaconda.com 不托管 conda-forge，其 cf 走独立域名 conda.anaconda.org。
//       ustc 实际不再自维护 defaults，会 302 跳转代理到南京大学 NJU（运行时由重定向检测标注）。
// ─────────────────────────────────────────────────────────────

const MIRRORS = [
  { id: 'official', name: '官方 repo.anaconda.com', base: 'https://repo.anaconda.com/pkgs/main',        cf: 'https://conda.anaconda.org/conda-forge' },
  { id: 'bfsu',     name: '北京外国语 BFSU',          base: 'https://mirrors.bfsu.edu.cn/anaconda/pkgs/main',  cf: 'https://mirrors.bfsu.edu.cn/anaconda/cloud/conda-forge' },
  { id: 'tuna',     name: '清华大学 tuna',            base: 'https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main', cf: 'https://mirrors.tuna.tsinghua.edu.cn/anaconda/cloud/conda-forge' },
  //{ id: 'ustc',     name: '中科大 USTC（跳转代理）',  base: 'https://mirrors.ustc.edu.cn/anaconda/pkgs/main',  cf: 'https://mirrors.ustc.edu.cn/anaconda/cloud/conda-forge' },
  { id: 'nju',      name: '南京大学 NJU',             base: 'https://mirror.nju.edu.cn/anaconda/pkgs/main',  cf: 'https://mirror.nju.edu.cn/anaconda/cloud/conda-forge' },
  { id: 'aliyun',   name: '阿里云',                   base: 'https://mirrors.aliyun.com/anaconda/pkgs/main',   cf: 'https://mirrors.aliyun.com/anaconda/cloud/conda-forge' },
  //{ id: 'netease',  name: '网易 163（疑似失效）',     base: 'https://mirrors.163.com/anaconda/pkgs/main',     cf: 'https://mirrors.163.com/anaconda/cloud/conda-forge' },
  { id: 'huawei',   name: '华为云',                   base: 'https://mirrors.huaweicloud.com/anaconda/pkgs/main', cf: 'https://mirrors.huaweicloud.com/anaconda/cloud/conda-forge' },
  { id: 'sjtug',    name: '上海交大 SJTU',            base: 'https://mirror.sjtu.edu.cn/anaconda/pkgs/main', cf: 'https://mirror.sjtu.edu.cn/anaconda/cloud/conda-forge' },
];

module.exports = MIRRORS;

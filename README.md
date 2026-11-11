# ROMA Lab 网站维护说明

纯静态站点（HTML / CSS / 原生 JS，无构建步骤）。线上：https://roma-ai-lab.github.io ，国内入口：https://roma-ai-lab.site 。推送到 `main` 分支后 GitHub Pages 自动部署。

## 本地预览

在仓库根目录执行：

```bash
python3 -m http.server 8000
```

然后打开 http://localhost:8000 。因为页面用 `fetch` 读 `data/*.json`，**不能直接双击打开 HTML 文件**（file:// 协议会被浏览器拦截）。也可用 `npx serve .` 等其他静态服务器。

## 日常更新改哪里

| 要更新的内容 | 文件 |
| --- | --- |
| 新闻 / 动态 | `data/news.json`（`items` 数组，`date` 用 `YYYY-MM-DD`，倒序；`text` 可含 HTML） |
| 成员信息 | `data/people.json`（`slug` 必须唯一，详情见 `content/people/<slug>.md`） |
| 研究项目 | `data/projects.json`（`slug` 必须唯一，详情见 `content/projects/<slug>.md`） |
| 论文列表 | `data/publications.bib`（BibTeX，前端解析） |
| 照片墙 | `data/gallery.json` + `assets/gallery/`（缩略图在 `assets/gallery/thumbs/`） |
| 首页照片墙封面 | `data/gallery_cover.json` |
| 视频 / 同行评价 | `data/videos.json` / `data/reputation.json` |
| 全局配置 | `data/settings.json`（手册链接、首页新闻条数、新闻起始日期） |

更完整的结构说明见 `structure.txt`。

## 图片约定

- 展示优先用 `.avif`；新增素材请同时提供一张 avif，同名 jpg/png 原始备份不进仓库。
- 照片墙列表用 520px 宽的 avif 缩略图，点击放大时才加载原 JPG（条目里的 `thumb` / `full` 字段）。新增照片时生成缩略图：

```bash
sips -s format avif -s formatOptions 45 -Z 520 \
  "assets/gallery/原图.jpg" --out "assets/gallery/thumbs/原图.avif"
```

- 分享封面为 `assets/og-cover.jpg`（1200×630），换图后各页的 `og:image` 无需改动。

## 发布流程

1. 开工先 `git pull`。
2. 改完先本地校验：JSON 语法、图片路径存在、slug 唯一、页面能渲染。
3. 提交并推送到 `main`，Pages 几分钟内自动生效。
4. 本仓库所在机器走代理，已设置 `git config --local http.version HTTP/1.1` 规避 HTTP/2 报错；凭据存于 macOS 钥匙串，不要写进任何项目文件。

## 注意事项

- `manual/` 是旧版实验手册的 Notion 导出静态页，**按负责人要求保留**；线上手册实际由 `data/settings.json` 的 `manual_url` 指向 Notion 页面。
- `content/` 被 `pages/pages.js` 的 `fetchMarkdown()` 引用，用于成员与项目详情页的附加简介，**不要删除**。
- `quiz/` 是独立的 CIT 新生测评子系统（题库、评分权重、faculty 页面），修改需单独评估。
- 站点级文件：`sitemap.xml`、`robots.txt`、`404.html`；新增公开页面时记得同步 sitemap 与各页的 canonical / og 标签。

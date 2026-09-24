# 看板发布与使用规则

在线地址：**https://libuyi543-lang.github.io/follow-builders/**

这份文档说明「建造者晨报」看板的几种形态，以及它们各自能做什么、不能做什么。

## 形态

| 形态 | 位置 | 数据来源 | 能否写操作 |
| --- | --- | --- | --- |
| 本机看板 | `http://127.0.0.1:4600`（双击 `打开看板.command`） | 实时读 `~/.follow-builders/archive/` | ✅ 加印、静音、改栏目 |
| 在线看板 | GitHub Pages（上面的网址） | 仓库里 `docs/api/*.json` 快照 | ❌ 只读 |

在线看板是**快照**，不是实时数据：只有你手动发布过的那几期才会出现在网上。

## 发布流程

改完内容后，双击：

```
信息筛选推送/发布看板.command
```

它做三件事：

1. `node dashboard/export-static.js` — 把 `~/.follow-builders/archive/` 里的全部日报导出到仓库的 `docs/`
2. `git commit -- docs` + `git push origin HEAD`
3. 打开在线网址

也可以手动跑：

```bash
cd 信息筛选推送/follow-builders
node dashboard/export-static.js        # 导出到 ./docs
git add docs && git commit -m "publish" && git push origin HEAD
```

导出会**整体重建** `docs/`，所以删掉的期数不会在网页上残留。

> 注意：导出时会去 GitHub 拉取最新的撰稿人名单（`config/default-sources.json`）。如果代理没开，会退回上次的缓存，名录页会显示「本次同步失败，沿用上次名单」——不影响出刊，想刷到最新名单就开着代理再导一次。

## 在线看板能做什么

- **今日 / 往期 / 名录** 三个版面正常浏览
- **中 / 对照 / 原文** 三档译文切换，快捷键 `T`，状态存在浏览器本地
- **← / →** 翻上/下一期
- **编辑推荐** 和 **本期要目** 点击后平滑滚动到正文
- 长推文的 **续读**、单条推文的 **译/原** 切换
- 往期页的印版日历：墨色越浓表示那期稿件越多

## 在线看板不做什么

- **不能加印**：顶部的「加印本期」按钮在在线版被隐藏。它需要本机跑 Node 脚本、调 DeepSeek、写归档目录，GitHub Pages 只能托管静态文件，没有后端。
- **不能静音 / 改栏目**：名录页的两个操作按钮同样隐藏。这些偏好写在 `~/.follow-builders/account-prefs.json`，属于本机状态，要改请在本机看板上改。改完重新发布一次，线上名录页就会同步；但已经出版的期数不会变，静音从下一期起生效。

在线版顶部会显示「在线版只读；静音与改栏目请在本机看板操作」的提示。

## 数据新鲜度

在线看板只反映**上次发布时**归档目录里的内容。想让线上出现今天这一期：

1. 先出刊（本机看板点「加印本期」，或跑 `run-feishu-digest.command`），让它写进 `~/.follow-builders/archive/`
2. 再跑 `发布看板.command`

定时任务（`com.lizhaohui.follow-builders.feishu`，每天 07:00）只负责出刊和推飞书，**不会自动发布到 GitHub**。也就是说线上默认会比本机慢一期，除非你每天都点一次发布。

想改成每天自动发布，可以再加一个 launchd 任务，在 07:20（出刊之后）跑 `发布看板.command`。

## 公开性

- 仓库是 **public**，任何人在 GitHub 上都能看到 `docs/api/*.json` 里的推文原文和中文译文。
- 内容全部来自公开信息源（X 公开帖子、公开播客、公开博客），归档文件里**不含**任何密钥、webhook 或本机路径——发布前已核对过。
- 你的飞书 webhook、DeepSeek key、代理设置都只存在于 `~/.follow-builders/.env`，**不在这个仓库里**，也不会被导出。
- 仓库里 `.gitignore` 已经排除 `scripts/node_modules/`、`.env`、`*.log`、`.DS_Store`。

## 与上游的关系

这个仓库是你账号下的 fork：

- `origin` → `libuyi543-lang/follow-builders`（你自己的，可以随便推）
- `upstream` → `zarazhangrui/follow-builders`（原作者的，你只读）

想跟上作者的更新：

```bash
cd 信息筛选推送/follow-builders
git fetch upstream
git rebase upstream/main      # 你的改动会叠在作者最新代码之上
git push origin HEAD --force-with-lease   # rebase 后历史变了，需要 force
```

`docs/` 和 `dashboard/` 是你独有的，作者那边没有，rebase 时不会冲突。

## 文件分工

```
follow-builders/
  dashboard/
    server.js           本机看板服务（含加印、静音等写操作）
    data.js             读侧数据视图，server 与 export 共用
    export-static.js    导出静态站到 ./docs
    web/                前端（本地与在线共用同一套文件）
  scripts/
    run-daily.js        出刊主流程：取稿 → 翻译 → 导语 → 归档 → 投递
    lib/archive.js      归档读写（~/.follow-builders/archive/YYYY-MM-DD.json）
    lib/roster.js       撰稿人名单同步 + 本机偏好
  docs/                 导出的静态站，GitHub Pages 发布目录
```

前端通过 `api/status.json` 是否存在来判断自己跑在哪种模式：本机服务没有这个路由，在线版有。这个判断结果会写进 `<html data-static>`，CSS 据此隐藏写操作按钮。

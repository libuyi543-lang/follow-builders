# 建造者晨报 · 看板使用说明

在线版（只读）：https://libuyi543-lang.github.io/follow-builders/

## 两种运行方式

| | 本地看板 | 在线看板（GitHub Pages） |
|---|---|---|
| 启动 | `cd scripts && npm run dashboard` → http://localhost:4600 | 自动托管 `docs/` 目录 |
| 浏览往期、名录 | ✅ | ✅ |
| 加印本期 / 静音账号 / 改栏目 | ✅ | ❌（没有后端，按钮自动隐藏） |
| 数据更新 | 实时读取本地归档 | 需手动导出并推送 |

端口可用环境变量修改：`PORT=4700 npm run dashboard`。

## 日常流程

```bash
cd scripts
npm install                 # 首次
npm run daily               # 拉取 feed → 生成当期晨报并归档
npm run dashboard           # 本地查看、调整名录偏好
npm run export-dashboard    # 导出静态快照到 ../docs
cd .. && git add docs && git commit -m "chore(dashboard): publish snapshot" && git push
```

推送后 GitHub Pages 一两分钟内更新。

## 使用规则

1. **密钥只放 `scripts/.env`**（如 `DEEPSEEK_API_KEY`），该文件已被 git 忽略，切勿提交。导出的 `docs/` 只含晨报内容与名录统计，不含任何密钥。
2. **写操作只在本地做。** 静音、改栏目等偏好保存在本地用户目录，线上看板只读；改完需重新导出推送，线上才会反映。
3. **`docs/` 是生成物**，不要手改，改样式请改 `dashboard/web/`，再跑 `npm run export-dashboard`。
4. 导出到其他目录：`node dashboard/export-static.js --out DIR`。

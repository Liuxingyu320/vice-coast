# VICE COAST · Caffeine 导入版

在 Caffeine 的 **Import from GitHub** 中填写：

| 字段 | 值 |
| --- | --- |
| GitHub repository | `https://github.com/Liuxingyu320/vice-coast.git` |
| Git ref | `codex/caffeine-import` |

游戏代码基于原始提交 [450f43b](https://github.com/Liuxingyu320/vice-coast/tree/450f43b9ec33cc5d909169a15a889ace71b3ccc4)。进入街区时，浏览器从该提交下载原始 GLB 文件。首次进入需要联网，大模型可能需要一段时间。存档保存在当前浏览器。

## 本地构建

```sh
pnpm install --frozen-lockfile
pnpm build
```

用静态 HTTP 服务器打开 `src/frontend/dist/`。Caffeine 通过各自的 `caffeine.toml` 构建前端静态文件和最小 Motoko 后端。离线版和 Blender 工程见 [xuong222 分支](https://github.com/Liuxingyu320/vice-coast/tree/xuong222)。

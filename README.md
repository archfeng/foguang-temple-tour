# 山寺行 · 佛光寺

一个基于 three.js 的第一人称佛光寺数字导览：可自由漫步的三维山寺、笔触点云工笔画风、四时天光，以及心愿石栏、香客礼拜、寺猫、瑞鹤、任务进度等玩法。附一个独立的禅房页面。

## 本地运行

需要 Python 3（无需 pip 安装依赖，只用标准库）：

```bash
python server.py
```

然后打开终端提示的地址（默认 <http://127.0.0.1:8895/>）。

也可以指定监听地址和端口：

```bash
python server.py --bind 0.0.0.0 --port 8895
# 或用环境变量
PORT=8895 python server.py
```

直接用静态服务器打开 `index.html` 也能游览，但**心愿登记会失效**——它依赖 `server.py` 提供的 `/api/wishes` 接口。

## 心愿数据

`server.py` 首次启动会在同目录自动创建 `foguang_lan_wishes.sqlite3`（本仓库不含真实数据）。心愿通过 `GET/POST /api/wishes` 读写，单条名字≤16 字、愿望≤120 字，最多 128 条。

## 主要结构

| 文件 | 作用 |
| --- | --- |
| `index.html` | 导览入口 |
| `tour.js` / `scene.json` | 漫游逻辑与场景配置 |
| `oilpaint3d.js` | 笔触点云核心（工笔风格在建模/笔触层实现） |
| `fxchain.js` / `gongbi.js` / `youhua.js` / `lightfx.js` | 画面风格与光照链 |
| `wonder/` | 心愿、瑞鹤、彩云、香客礼拜等玩法模块 |
| `zen/` | 独立的禅房页面 |
| `server.py` | 静态服务 + 心愿接口 |
| `DESIGN.md` | 视觉规范（墨绿纸面 + 宋体字阶 + 唐木金强调） |

## 同游说明

`presence.js` 默认留空云端配置，走本地 `BroadcastChannel` 同游（同一浏览器多标签页可见）。如需跨设备同游，填入自己的 endpoint 与 publishableKey 即可。

## 素材许可

`three.min.js` 遵循 MIT，见 `three-LICENSE.txt`。项目内模型、贴图、音频与影像为各自权利人所有；`media/foguang-1937-archives.mp4` 为历史影像资料，请自行确认使用权限后再对外发布。

# INMO 潜行行动

Three.js 45° 俯视潜行小游戏。玩家从街道进入半剖面的 INMO 展厅，在红色摄像头扇形视野和店员黄色视线之间寻找时机，取走六个柜台上的眼镜。

[在线游玩](https://inmo-ar-stealth-game.netlify.app) · [GitHub 源码](https://github.com/elfwind724/inmo-ar-stealth-game)

## 场景与眼镜素材

展厅使用深色石材、金属展柜、分柜聚光、环境反射和柔和投影。六副眼镜拥有独立镜框轮廓、镜片、镜腿、鼻托和传感器细节；场景模型为游戏展示而制作，并非原厂 CAD 模型。走近柜台可查看对应的产品展示图，图鉴中也保留了产品图。

产品图片来自 [INMO Air 发布报道](https://www.leiphone.com/category/industrynews/0d1ucsnmAHQrTqtO.html)、[官方支持中心](https://support.inmoxr.com/) 与 [GO3 官方产品页](https://www.inmo.com/products/inmo-go3)，原图地址记录于 `assets/products/sources.json`。图片与品牌权利属于各自权利人。

## 操作

- `WASD` / 方向键：按画面方向移动；触屏设备显示方向按钮
- 点击地面：绕开柜台、墙面和绿植，走到目标位置
- 点击柜台或展开清单后点击型号：自动走近，抵达后手动选择取镜
- `Shift` / `C`：切换蹲姿慢走，方便微调位置
- `E` / 空格，或点击近处柜台的“取走眼镜”：开始约 1.4 秒的取镜动作；移动可中断
- `Esc` / `P`：暂停、继续，或关闭当前说明/榜单
- `R`：重新开始；`M`：音效开关；`V`：重置视角
- 按住鼠标右键拖动：轻微旋转观察方向
- 鼠标滚轮不会缩放画面

进入视线本身会发出警示；正在取镜时被摄像头或店员看到会被抓获，包括取镜完成的最后一帧。店员巡看六个柜台，偶尔玩手机，此时黄色视线消失。取完六副即可通关，通关成绩自动保存到本机前十榜单，可修改代号，同一局不会重复入榜。得分为人民币参考总价加潜行与速度奖励。排行榜保存在当前浏览器中，不跨设备同步。

清单和地图默认收起，可点击展开。价格参考、排行榜和帮助窗口会暂停计时与巡逻；切走窗口时也会暂停并清除移动按键状态，返回后手动继续。

## 眼镜价格参考

价格采用中国市场公开发布价或指导价，促销和现售渠道价格可能不同。游戏内“价格参考”可逐款打开来源。

| 柜台 | 型号 | 参考价 | 价格类型 | 来源 |
|---|---|---:|---|---|
| 1 | INMO Air1 | ¥2,999 | 公开售价 | [雷峰网](https://www.leiphone.com/category/industrynews/0d1ucsnmAHQrTqtO.html) |
| 2 | INMO Air2 | ¥3,999 | 官方零售价 | [泡咖 AI](https://www.paoka.com/product/INMO-Air2) |
| 3 | INMO Air3 | ¥4,999 | 公开指导价 | [太阳眼镜网](https://news.43y.com.cn/n/9337.html) |
| 4 | INMO Go1 | ¥1,999 | 官方指导价 | [界面新闻](https://www.jiemian.com/article/10053458.html) |
| 5 | INMO GO2 | ¥3,999 | 公开定价 | [太阳眼镜网](https://news.43y.com.cn/n/9337.html) |
| 6 | INMO GO3 | ¥2,999 | 首发价 | [新浪科技 / TechWeb](https://finance.sina.com.cn/tech/roll/2025-10-17/doc-infucfic2266513.shtml) |

## 本地运行与部署

需要 Node.js 20 或更新版本。

```sh
npm ci
npm run build
npm run dev
```

浏览器打开 `http://127.0.0.1:4173`。开发服务器提供构建后的 `dist/`，修改源码后重新运行构建并刷新页面。

构建同时生成 `release/inmo_3d_ar_optimized.html`，是内嵌了运行依赖的单文件版本，可直接双击用浏览器打开，方便本地游玩和拷贝。首次下载源码仍需先构建。

源码入口为 `index.html`，规则与寻路在 `game-rules.js`，界面补充样式在 `ui-polish.css`。构建会将固定版本的 Three.js 和生成的 Tailwind CSS 一起放入 `dist/`，发布后的运行资源不依赖第三方 CDN；价格来源链接需联网访问。`dist/vendor/THREE-LICENSE.txt` 保留了 Three.js 许可。

Netlify 已在 `netlify.toml` 配置：构建命令 `npm run build`，发布目录 `dist`。上传源码仓库后可直接接入持续部署，也可手动上传 `dist/`。原始下载文件保持不变。

## 已有自动检查

`npm test` 检查真实地图的六柜台寻路、柜台与店员碰撞、视野边界、取镜判负优先级、屏幕方向移动、场景初始化、暂停、重开与本机成绩保存。运行流程检查采用模拟 WebGL 渲染器，不能替代浏览器中的实际画面和设备性能验证。

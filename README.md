# SVG 转 PNG 下载器（浏览器扩展）

这是一个基于 Chrome Manifest V3 的浏览器插件，用来扫描当前页面中的内联 `&lt;svg&gt;` 元素，并批量导出为 PNG 图片。

## 功能特性

- 扫描当前页面内联 SVG（支持多帧、所有 iframe，见 `manifest.json`）
- 支持「尽量还原样式」导出（内联计算样式）或「原始 SVG」两种模式（`popup.html`）
- 支持设置导出倍率（1–8 倍），支持透明/白底背景
- 可勾选“仅可见”过滤当前视口内实际可见的 SVG
- 预览每一个 SVG 的缩略图、尺寸和选择器信息
- 单个下载 PNG，或一键“全部下载”
- 复制 SVG 源码到剪贴板

## 目录结构

```text
.
  manifest.json      # Chrome 扩展清单
  popup.html         # 弹窗 UI
  popup.js           # 弹窗逻辑：扫描、预览、批量导出
  contentScript.js   # 注入页面：构建 SVG 快照，处理样式和导出
  serviceWorker.js   # 背景脚本：下载权限、右键菜单、图标
  icon.svg           # 扩展图标
```

## 在浏览器中加载

以 Chrome 为例：

1. 访问 `chrome://extensions`
2. 打开右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本项目目录（包含 `manifest.json` 的文件夹）
5. 安装后点击工具栏图标打开扩展弹窗

> 若是第一次开发调试，建议勾选「允许在隐身模式运行」方便在不同网站测试。

## 使用说明

1. 打开任意包含内联 SVG 的页面（如图标站、产品控制台等）
2. 点击浏览器工具栏中的「SVG 转 PNG 下载」图标
3. 在弹窗顶部可以调整：
   - 导出倍率（倍数越大，生成的 PNG 分辨率越高）
   - 样式处理方式（计算样式 / 原始 SVG）
   - 背景（透明 / 白底）
   - 是否只扫描当前可见的 SVG
4. 列表中会展示所有匹配到的 SVG：
   - 左侧为预览图
   - 右侧显示标题/ID、尺寸和 CSS 选择器
5. 对单个资源：
   - 点击「下载 PNG」导出对应图片
   - 点击「复制 SVG」复制源码
6. 对全部资源：
   - 点击顶部「全部下载」批量导出

## 权限说明

参考 `manifest.json`：

- `activeTab`：只在你当前激活的标签页上运行扫描逻辑
- `scripting`：向页面注入脚本，以便读取内联 SVG 并渲染为图片
- `downloads`：调用浏览器下载 API 保存 PNG 文件
- `contextMenus`：在右键菜单中添加「导出当前 SVG 为 PNG」
- `host_permissions: "<all_urls>"`：便于在不同网站上测试与使用

所有 SVG 处理逻辑均在本地浏览器环境中完成，不会上传到服务器。

## 开发说明

本扩展没有打包流程，所有代码均为原生 JS + 原生 DOM 操作：

- 弹窗入口：`popup.html` + `popup.js`
- 页面扫描与样式快照：`contentScript.js`
- PNG 栅格化逻辑：`popup.js:43` 以及 `contentScript.js:301`
- 下载入口：`serviceWorker.js:85`

调试建议：

- 使用 Chrome 扩展管理页的「检查视图」打开 popup 和 service worker 的 DevTools
- 在页面 DevTools 中查看注入的 `contentScript.js` 日志与报错

## 注意事项

- 仅用于你有合法权利保存/使用的 SVG 资源
- 一些复杂 SVG（滤镜、外链字体、跨域图片等）在 Canvas 渲染时可能有差异
- 在高倍率和大量 SVG 批量导出时，请注意浏览器内存占用

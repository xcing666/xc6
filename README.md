# GitHub 上传须知

## 文件夹说明
此文件夹包含需要上传到 GitHub 的所有网站文件，已与记忆文件（.workbuddy）和其他不需要上传的文件分离。

## 上传步骤

### 方法一：通过 GitHub 网页端上传
1. 访问您的 GitHub 仓库（例如：`https://github.com/xcing666/xc6`）
2. 点击 "Add file" → "Upload files"
3. 将 `github-upload` 文件夹内的所有文件拖拽到页面中
4. 填写提交信息（例如："更新网站文件"）
5. 点击 "Commit changes"

### 方法二：通过 Git 命令行上传
```bash
# 进入 github-upload 文件夹
cd github-upload

# 初始化 Git（如果还没有）
git init

# 添加远程仓库（替换成您的仓库地址）
git remote add origin https://github.com/xcing666/xc6.git

# 添加所有文件
git add .

# 提交
git commit -m "更新网站文件"

# 推送到 GitHub
git push -u origin main
```

## 排除文件说明
以下文件和文件夹已排除，不需要上传：
- `.workbuddy/` - WorkBuddy 记忆文件
- `node_modules/` - Node.js 依赖
- `.git/` - Git 版本控制文件
- `*.ps1`、`*.bat` - PowerShell 和批处理脚本
- `*.bak` - 备份文件

## 注意事项
1. 上传前请检查 `style.css` 中的版本号（?v=时间戳），确保浏览器加载最新版本
2. 如果使用 GitHub Pages，确保仓库设置中已启用 Pages 功能
3. 上传后等待 1-2 分钟，GitHub Pages 会自动部署

## 文件清单
- `index.html` - 首页
- `style.css` - 样式文件
- `script.js` - 脚本文件
- `design/` - 广告设计页面
- `miniprogram/` - 小程序开发页面
- `tools/` - 智能工具中心页面
- `blog/` - 博客文章页面
- `cases/` - 客户案例图片
- 其他 HTML 文件（社交媒体、拼多多助力、FAQ 等）

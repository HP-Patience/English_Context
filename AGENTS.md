<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 构建与部署

- 推送到 `master` 会触发 `.github/workflows/deploy.yml`，自动部署生产环境。
- 测试和 Next.js standalone 构建由 GitHub Actions 完成。不要在生产服务器上构建。
- 生产环境通过用户级 `english-context.service` 运行，工作目录为 `%h/English_Context/current`。
- 管理服务必须使用 `systemctl --user`，不要使用 `sudo systemctl`。
- 部署按 Git 提交创建 release 目录。启动或健康检查失败时会自动回滚。
- 运行时密钥只保存在服务器环境变量文件中。禁止提交、打印、打包或覆盖生产环境变量文件。
- 修改 `prisma/schema.prisma` 时必须单独制定数据库部署方案。当前工作流不会自动更新数据库结构。

## 生产环境约束

- 生产环境目前通过明文 HTTP 的 `3456` 端口访问。使用受安全上下文限制的浏览器 API 时，必须提供 HTTP 兼容方案并添加相应测试。
- 生产服务器内存有限。禁止在服务器上执行构建、依赖安装或其他高内存部署任务。

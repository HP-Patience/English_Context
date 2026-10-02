# 多用户数据库迁移说明

本功能把现有固定 `local-user` 数据迁移为唯一管理员账号，并增加数据库账号字段。生产环境必须先备份，再按顺序执行，不使用 `prisma db push` 替代迁移。

## 执行顺序

1. 备份 PostgreSQL，并记录备份标识。
2. 部署 `prisma/migrations/20261002_multi_user_accounts/migration.sql`。
3. 在应用相同运行环境中执行：

   ```bash
   node scripts/migrate-single-user-to-admin.mjs
   ```

   该脚本读取 `LOCAL_USER_ID`、`APP_AUTH_USERNAME` 和 `APP_AUTH_PASSWORD_HASH`，不会打印密码、哈希、数据库 URL 或 API Key。

4. 验证数据库中存在且只有一个 `admin` 账号，且所有 `User.username` 和 `User.passwordHash` 都非空。
5. 部署 `prisma/migrations/20261002_require_account_credentials/migration.sql`。
6. 重启应用。
7. 用管理员账号登录，确认原有学习、复习和故事进度仍存在。
8. 创建一个测试普通账号，确认其学习数据为空且无法看到管理员数据。

## 失败恢复

- 添加字段阶段失败：停止后从备份恢复，或修复迁移后重新执行；不要手工删除用户学习表。
- 回填阶段失败：不执行第二条约束迁移，保留可回填的 nullable 字段，检查环境变量和目标用户。
- 约束阶段失败：说明仍有账号凭据为空；修复回填后再执行，不能用空字符串绕过检查。
- 登录或数据验收失败：停止发布并按备份标识恢复数据库，再恢复旧应用版本。

## 约束

- 不在生产服务器执行构建、依赖安装或高内存任务。
- 不把生产环境变量文件、密码或 API Key 加入 Git、日志或归档包。
- 当前 IP + HTTP 仅为临时熟人测试约束；公网正式使用前应配置 HTTPS。

## 互动表迁移

在账号字段回填和约束迁移完成后，再部署 prisma/migrations/20261002_multi_user_interactions/migration.sql；失败时恢复备份，不手工删除互动表。

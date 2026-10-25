# CI, Issue and Release Automation Implementation Plan

目标：先在 `kanospace/NeriPlayer-dev-test` 验证 CI 提速、Issue 分诊与可追溯 Release，再供正式仓库迁移

设计与约束：

- 基线为 `c362c9ac08d16ecac7434fcfae838a7d09c3d259`，保留其他检出目录的未提交修改
- 用户选择普通模拟器由 2 分片扩到 4 分片，保留歌词与旋转独立宿主、库模块完整测试及全部质量门禁
- 将打包与测试并行，最终 `build` 状态等待所有门禁；仅正式仓库 `push master` 可发送 Telegram
- 现有依赖缓存改用 Gradle 构建缓存；不启用未经验证的 configuration cache
- 三种 Issue 表单复用已有类型、模块、平台与状态标签，补齐版本、安装来源和 UUID；禁用普通空白模板
- Issue 首次创建时按明确表单选项补充标签；P0/P1/P2/P3 由维护者分诊，不通过关键词猜优先级，不覆盖人工标签
- 每次构建只生成一次 UUID 和时间，APK、元数据、校验和与发布说明一致；测试仓发布只能产出未签名草稿测试版
- 不修改生产仓库，不读写生产签名或账号设置，不操作实体设备

## Task 1: CI

- [ ] 修改 `.github/workflows/android_ci.yml` 的并行依赖、4 分片、缓存与构建输入
- [ ] 保留 Worker 一份完整检查，并验证聚合对失败、取消和跳过均拒绝
- [ ] 本地 actionlint，通过后在测试仓执行完整 CI，记录真实耗时与分片测试数量

## Task 2: Issues

- [ ] 更新 `.github/ISSUE_TEMPLATE/`，创建标签目录、同步及自动标签工作流
- [ ] 使用 Node 标准库测试受控字段映射、未知输入、人工标签与恶意正文
- [ ] 同步测试仓标签，用临时 Issue 验证自动标签后关闭测试 Issue

## Task 3: Releases

- [ ] 增加 `buildUuid` / `buildTimestamp` Gradle 输入及严格验证
- [ ] 用 Python 标准库实现和测试 prepare、stage、notes，核对 APK 与元数据 UUID
- [ ] 手动发布增加受限测试模式，全 ABI 未签名产物只生成 draft prerelease
- [ ] 在测试仓验证 UUID、SHA256SUMS 和草稿测试版资产

## Task 4: Integration

- [ ] 增加轻量 Automation checks，检查 YAML、表单与标签引用、脚本测试和工作流语法
- [ ] 审查完整 diff 和独立代码审查，限定暂存文件后推送测试仓
- [ ] 等待当前 SHA 的 CI 终态，记录失败原因及未覆盖风险，不以本地通过替代远端结果

验证边界：增加分片提高 runner 用量；缓存收益受冷缓存和并发容量影响。禁止把预计提速当作实测结果。GitHub 管理员仍可能看到仅维护者可用的空白 Issue 入口

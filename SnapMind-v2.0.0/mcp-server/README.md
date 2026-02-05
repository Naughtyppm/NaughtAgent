# SnapMind MCP Server v2.0.06

> 三层精简架构 + 累积式项目记忆

## 🚀 安装

```bash
cd mcp-server
pip install -e .
```

## 🏗️ 架构改进

### 删除的冗余层
- ❌ 精炼快照 (digest-XXX.md)
- ❌ 记忆快照 (memory-XXX.md)

### 新增的项目记忆
- ✅ `projects/{项目}.md` - 累积式
- ✅ 最近 10 条工作记录
- ✅ 自动提取关键决策

### 自动归档
- ✅ 超 30 天自动移到 archive/
- ✅ 搜索可搜归档内容

## 🛠️ 工具列表

| 工具              | 功能                       |
| ----------------- | -------------------------- |
| `save_snapshot`   | 保存 + 更新项目记忆 + 全局 |
| `load_memory`     | 全局 + 项目记忆 + 按需快照 |
| `get_status`      | 系统状态                   |
| `search_history`  | 搜索（含归档）             |
| `check_health`    | 健康度                     |
| `merge_snapshots` | 合并                       |
| `export_memory`   | 导出                       |
| `import_memory`   | 导入                       |

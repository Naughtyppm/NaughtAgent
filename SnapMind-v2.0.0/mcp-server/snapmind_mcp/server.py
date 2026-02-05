"""SnapMind MCP Server v2.1.00 - AI 记忆系统核心服务

架构重构：方案C - 三层精简 + 项目记忆 + 自动归档 + 智能筛选

层级结构：
- 第1层：全局记忆 (memory/global/) - 所有项目状态总览
- 第2层：项目记忆 (memory/projects/) - 累积式，最近10条+关键决策
- 第3层：完整记忆 (memory/full/) - 详细内容，按需加载
- 归档层：归档 (memory/archive/) - 超30天自动归档

v2.1.00 新增：
- 智能重要性评估（5级：CRITICAL/HIGH/MEDIUM/LOW/TEMP）
- Token 预算控制
- 精准度分级（A/B/C）
- 自动清理优先删除低重要性快照
"""

import os
import re
import json
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

server = Server("snapmind-mcp-server")

# ============ 路径配置 ============

def find_kiro_dir() -> Path:
    """查找 .kiro 目录"""
    if "KIRO_WORKSPACE" in os.environ:
        return Path(os.environ["KIRO_WORKSPACE"]) / ".kiro"
    
    common_paths = [
        Path(r"F:\Web Project Hub"),
        Path.home() / "Projects",
        Path.cwd(),
    ]
    
    for p in common_paths:
        if (p / ".kiro").exists():
            return p / ".kiro"
    
    current = Path.cwd()
    for _ in range(10):
        if (current / ".kiro").exists():
            return current / ".kiro"
        if current.parent == current:
            break
        current = current.parent
    
    return Path.cwd() / ".kiro"

KIRO_DIR = find_kiro_dir()
WORKSPACE_ROOT = KIRO_DIR.parent
MEMORY_DIR = KIRO_DIR / "memory"
FULL_MEMORY_DIR = MEMORY_DIR / "full"  # 完整记忆（原 snapshots）
PROJECTS_DIR = MEMORY_DIR / "projects"  # 项目记忆
ARCHIVE_DIR = MEMORY_DIR / "archive"    # 归档
INDEX_FILE = KIRO_DIR / "task-snapshot-index.txt"
GLOBAL_MEMORY_FILE = MEMORY_DIR / "global" / "global-memory.md"
TECH_DECISIONS_FILE = MEMORY_DIR / "tech-decisions.md"

# ============ 配置（可通过控制面板修改）============

# 默认配置
DEFAULT_CONFIG = {
    "max_full_memory": 50,        # 完整快照最大数量
    "active_days": 30,            # 活跃期（天）
    "archive_days": 30,           # 冷藏期（天），超过后自动删除
    "cleanup_interval": 10,       # 每N次保存触发清理
    "project_memory_items": 10,   # 项目记忆保留条数
}

# 配置文件路径
CONFIG_FILE = None  # 延迟初始化

def load_config() -> dict:
    """加载配置（支持控制面板自定义）"""
    global CONFIG_FILE
    if CONFIG_FILE is None:
        CONFIG_FILE = KIRO_DIR / "snapmind-config.json"
    
    config = DEFAULT_CONFIG.copy()
    
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                user_config = json.load(f)
                config.update(user_config)
        except:
            pass
    
    return config

def save_config(config: dict):
    """保存配置"""
    global CONFIG_FILE
    if CONFIG_FILE is None:
        CONFIG_FILE = KIRO_DIR / "snapmind-config.json"
    
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

# 运行时配置（从文件加载）
def get_config(key: str):
    return load_config().get(key, DEFAULT_CONFIG.get(key))

# 兼容旧代码的常量
MAX_FULL_MEMORY = DEFAULT_CONFIG["max_full_memory"]
ARCHIVE_DAYS = DEFAULT_CONFIG["active_days"]
CLEANUP_INTERVAL = DEFAULT_CONFIG["cleanup_interval"]
PROJECT_MEMORY_ITEMS = DEFAULT_CONFIG["project_memory_items"]

# Token 预算配置
TOKEN_BUDGET = {
    "project": (300, 500),   # 项目记忆
    "full": (2000, 3000),    # 完整快照
}

# 重要性等级配置
IMPORTANCE_LEVELS = {
    "CRITICAL": {"score": 5, "retention_days": 365 * 10, "emoji": "⭐⭐⭐⭐⭐"},
    "HIGH": {"score": 4, "retention_days": 180, "emoji": "⭐⭐⭐⭐"},
    "MEDIUM": {"score": 3, "retention_days": 90, "emoji": "⭐⭐⭐"},
    "LOW": {"score": 2, "retention_days": 30, "emoji": "⭐⭐"},
    "TEMP": {"score": 1, "retention_days": 7, "emoji": "⭐"},
}


# ============ 工具函数 ============

def get_current_index() -> int:
    if INDEX_FILE.exists():
        return int(INDEX_FILE.read_text().strip())
    return 0

def set_current_index(index: int):
    INDEX_FILE.parent.mkdir(parents=True, exist_ok=True)
    INDEX_FILE.write_text(str(index))

def ensure_dirs(project: str):
    (FULL_MEMORY_DIR / project).mkdir(parents=True, exist_ok=True)
    (PROJECTS_DIR).mkdir(parents=True, exist_ok=True)
    (ARCHIVE_DIR / project).mkdir(parents=True, exist_ok=True)
    (MEMORY_DIR / "global").mkdir(parents=True, exist_ok=True)

def get_file_num(filepath: Path) -> int:
    try:
        return int(filepath.stem.split("-")[1])
    except:
        return 0


def estimate_tokens(text: str) -> int:
    """估算文本的 token 数量（粗略：中文1字≈1.5token，英文1词≈1token）"""
    chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', text))
    english_words = len(re.findall(r'[a-zA-Z]+', text))
    return int(chinese_chars * 1.5 + english_words)


def auto_evaluate_importance(summary: str, details: str, tags: str, version: str) -> tuple:
    """
    自动评估重要性等级
    返回: (importance_level, precision_grade, reason)
    """
    all_content = f"{summary} {details} {tags} {version}".lower()
    
    # 规则1：版本号变化 ≥ +0.1.00 → CRITICAL
    if version:
        major_version = re.search(r'v(\d+)\.(\d+)', version)
        if major_version:
            minor = int(major_version.group(2))
            if minor >= 1 and "发布" in all_content:
                return ("CRITICAL", "A", "大版本发布")
    
    # 规则2：关键词匹配
    critical_keywords = ["重大", "里程碑", "架构重构", "release", "上线", "发布"]
    high_keywords = ["p0", "p1", "bug修复", "新功能", "模块", "fix", "修复"]
    medium_keywords = ["优化", "重构", "改进", "增强", "完善"]
    low_keywords = ["文档", "注释", "readme", "说明", "格式"]
    temp_keywords = ["调试", "debug", "临时", "测试", "temp", "wip"]
    
    # 检查关键词
    for kw in critical_keywords:
        if kw in all_content:
            return ("CRITICAL", "A", f"关键词匹配: {kw}")
    
    for kw in high_keywords:
        if kw in all_content:
            return ("HIGH", "A", f"关键词匹配: {kw}")
    
    for kw in medium_keywords:
        if kw in all_content:
            return ("MEDIUM", "B", f"关键词匹配: {kw}")
    
    for kw in low_keywords:
        if kw in all_content:
            return ("LOW", "B", f"关键词匹配: {kw}")
    
    for kw in temp_keywords:
        if kw in all_content:
            return ("TEMP", "C", f"关键词匹配: {kw}")
    
    # 规则3：标签检查
    if "#arch" in tags.lower():
        return ("HIGH", "A", "架构决策标签")
    if "#feat" in tags.lower():
        return ("HIGH", "A", "功能开发标签")
    if "#fix" in tags.lower():
        return ("HIGH", "A", "Bug修复标签")
    if "#perf" in tags.lower():
        return ("MEDIUM", "B", "性能优化标签")
    if "#doc" in tags.lower():
        return ("LOW", "B", "文档更新标签")
    if "#temp" in tags.lower():
        return ("TEMP", "C", "临时方案标签")
    if "#refactor" in tags.lower():
        return ("MEDIUM", "B", "重构标签")
    
    # 默认：MEDIUM
    return ("MEDIUM", "B", "默认评估")


def get_precision_description(grade: str) -> str:
    """获取精准度描述"""
    descriptions = {
        "A": "含关键决策和版本信息",
        "B": "含修改文件和测试结果",
        "C": "仅含基本信息",
    }
    return descriptions.get(grade, "未知")


def truncate_to_budget(text: str, max_tokens: int) -> str:
    """截断文本到 token 预算内"""
    current_tokens = estimate_tokens(text)
    if current_tokens <= max_tokens:
        return text
    
    # 按比例截断
    ratio = max_tokens / current_tokens
    target_len = int(len(text) * ratio * 0.9)  # 留10%余量
    return text[:target_len] + "\n...(已截断)"


def update_keyword_index(project: str, idx: str, summary: str, details: str, files: str, tags: str):
    """更新关键词索引"""
    index_file = MEMORY_DIR / "index.md"
    
    # 提取关键词
    all_text = f"{summary} {details} {files} {tags}".lower()
    keywords = set()
    
    # 版本号
    for match in re.findall(r'v\d+\.\d+\.?\d*', all_text):
        keywords.add(match)
    
    # 项目名
    keywords.add(project.lower())
    
    # 标签
    for tag in tags.split(','):
        tag = tag.strip().lower()
        if tag and len(tag) > 1:
            keywords.add(tag)
    
    # 常见技术词
    tech_words = ['bug', 'fix', '修复', '优化', '重构', 'harmony', 'patch', '线程', '性能', 
                  '配置', '部署', '编译', '测试', '日志', '异常', '错误', 'error']
    for word in tech_words:
        if word in all_text:
            keywords.add(word)
    
    # 读取现有索引
    if index_file.exists():
        content = index_file.read_text(encoding="utf-8")
    else:
        content = f"""# 关键词索引
> 自动生成，用于快速定位记忆

"""
    
    # 更新索引
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    for kw in keywords:
        if not kw:
            continue
        # 查找该关键词的行
        pattern = rf'^- \*\*{re.escape(kw)}\*\*: (.*)$'
        match = re.search(pattern, content, re.MULTILINE)
        if match:
            # 追加快照号（去重）
            existing = match.group(1)
            if f"#{idx}" not in existing:
                new_line = f"- **{kw}**: {existing}, #{idx}"
                content = re.sub(pattern, new_line, content, flags=re.MULTILINE)
        else:
            # 新增关键词
            content += f"- **{kw}**: #{idx}\n"
    
    # 更新时间戳
    content = re.sub(r'> 自动生成.*', f'> 自动生成于 {now}，用于快速定位记忆', content)
    
    index_file.write_text(content, encoding="utf-8")


def update_global_memory(project: str, summary: str, version: str = "", status: str = "🔧"):
    """更新全局记忆"""
    GLOBAL_MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    if not GLOBAL_MEMORY_FILE.exists():
        content = f"""# 全局记忆快照
> 最后更新: {now} | 汇总所有项目核心状态

## 📊 项目状态总览

| 项目 | 版本 | 最近工作 | 状态 |
| ---- | ---- | -------- | ---- |
| {project} | {version} | {summary[:30]}... | {status} |

## 🔑 全局关键决策
- （自动同步自 tech-decisions.md）

## 👤 用户偏好
- （自动记录）
"""
        GLOBAL_MEMORY_FILE.write_text(content, encoding="utf-8")
        return
    
    content = GLOBAL_MEMORY_FILE.read_text(encoding="utf-8")
    content = re.sub(r'> 最后更新: .*? \|', f'> 最后更新: {now} |', content)
    
    if f"| {project} |" in content:
        pattern = rf'\| {re.escape(project)} \|[^\n]*\n'
        new_line = f"| {project} | {version} | {summary[:30]}... | {status} |\n"
        content = re.sub(pattern, new_line, content)
    else:
        table_end = content.find("\n\n## 🔑")
        if table_end > 0:
            new_line = f"| {project} | {version} | {summary[:30]}... | {status} |\n"
            content = content[:table_end] + new_line + content[table_end:]
    
    GLOBAL_MEMORY_FILE.write_text(content, encoding="utf-8")


def update_project_memory(project: str, summary: str, version: str = "", files: str = "", tags: str = ""):
    """更新项目记忆（累积式）"""
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    project_file = PROJECTS_DIR / f"{project}.md"
    
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    index = get_current_index()
    
    # 从 tech-decisions 提取该项目的决策
    decisions = extract_project_decisions(project)
    
    if not project_file.exists():
        # 创建新的项目记忆
        content = f"""# {project} 项目记忆
> 最后更新: {now} | 版本: {version}

## 📋 近期工作（最新10条）

| # | 日期 | 内容 | 标签 |
|---|------|------|------|
| {index:03d} | {now[:10]} | {summary[:40]} | {tags[:20]} |

## 🔑 关键决策
{decisions if decisions else "- （暂无）"}

## 📁 常用文件
{files if files else "- （暂无）"}
"""
        project_file.write_text(content, encoding="utf-8")
        return
    
    # 更新现有项目记忆
    content = project_file.read_text(encoding="utf-8")
    
    # 更新时间戳和版本
    content = re.sub(r'> 最后更新: .*? \|', f'> 最后更新: {now} |', content)
    if version:
        content = re.sub(r'\| 版本: .*', f'| 版本: {version}', content)
    
    # 在表格中添加新记录（保持最新10条）
    table_pattern = r'(\| # \| 日期 \| 内容 \| 标签 \|\n\|---\|------\|------\|------\|\n)((?:\|[^\n]*\n)*)'
    match = re.search(table_pattern, content)
    
    if match:
        header = match.group(1)
        rows = match.group(2)
        
        # 解析现有行
        existing_rows = [r for r in rows.strip().split('\n') if r.startswith('|')]
        
        # 添加新行到开头
        new_row = f"| {index:03d} | {now[:10]} | {summary[:40]} | {tags[:20]} |"
        existing_rows.insert(0, new_row)
        
        # 只保留最新 N 条
        existing_rows = existing_rows[:PROJECT_MEMORY_ITEMS]
        
        # 重建表格
        new_table = header + '\n'.join(existing_rows) + '\n'
        content = content[:match.start()] + new_table + content[match.end():]
    
    # 更新关键决策
    if decisions:
        content = re.sub(
            r'## 🔑 关键决策\n(?:.*?\n)*?(?=\n## |\Z)',
            f'## 🔑 关键决策\n{decisions}\n\n',
            content,
            flags=re.DOTALL
        )
    
    project_file.write_text(content, encoding="utf-8")


def extract_project_decisions(project: str) -> str:
    """从 tech-decisions.md 提取项目相关决策"""
    if not TECH_DECISIONS_FILE.exists():
        return ""
    
    content = TECH_DECISIONS_FILE.read_text(encoding="utf-8")
    
    # 查找项目缩写映射
    abbrev_map = {
        "KiroWatcher": "KW", "Replicant": "RP", "RealmBounDary": "RB",
        "SnapMind": "SM", "LastStand": "LS", "ServerHub": "SH",
        "ServerGateway": "SG", "General": "GN"
    }
    
    abbrev = abbrev_map.get(project, project[:2].upper())
    
    # 提取该项目的生效决策
    decisions = []
    pattern = rf'\[D{abbrev}-\d+\][^\n]*✅'
    matches = re.findall(pattern, content)
    
    for m in matches[:5]:  # 最多5条
        decisions.append(f"- {m}")
    
    return '\n'.join(decisions) if decisions else ""


def auto_archive():
    """自动归档 + 冷藏期过期删除"""
    if not FULL_MEMORY_DIR.exists():
        return ""
    
    config = load_config()
    active_days = config.get("active_days", 30)
    archive_days = config.get("archive_days", 30)
    
    archived = 0
    deleted = 0
    
    now = datetime.now().timestamp()
    active_cutoff = now - (active_days * 86400)      # 活跃期截止
    archive_cutoff = now - ((active_days + archive_days) * 86400)  # 冷藏期截止
    
    # 1. 活跃快照 → 归档（超过活跃期）
    for proj_dir in FULL_MEMORY_DIR.iterdir():
        if not proj_dir.is_dir():
            continue
        
        archive_proj = ARCHIVE_DIR / proj_dir.name
        archive_proj.mkdir(parents=True, exist_ok=True)
        
        for f in proj_dir.glob("snapshot-*.md"):
            # 跳过 [IMP] 标记的（永不归档）
            content = f.read_text(encoding="utf-8")
            if "[IMP]" in content:
                continue
            
            if f.stat().st_mtime < active_cutoff:
                dest = archive_proj / f.name
                f.rename(dest)
                archived += 1
    
    # 2. 归档快照 → 删除（超过冷藏期）
    if ARCHIVE_DIR.exists():
        for proj_dir in ARCHIVE_DIR.iterdir():
            if not proj_dir.is_dir():
                continue
            
            for f in proj_dir.glob("snapshot-*.md"):
                # 跳过 [IMP] 标记的（永不删除）
                content = f.read_text(encoding="utf-8")
                if "[IMP]" in content:
                    continue
                
                if f.stat().st_mtime < archive_cutoff:
                    f.unlink()
                    deleted += 1
    
    result = []
    if archived > 0:
        result.append(f"📦 归档 {archived} 条")
    if deleted > 0:
        result.append(f"🗑️ 删除 {deleted} 条（冷藏期过期）")
    
    return " | ".join(result) if result else ""


def calculate_importance_score(filepath: Path) -> int:
    """计算快照重要性评分"""
    try:
        content = filepath.read_text(encoding="utf-8").lower()
    except:
        return 0
    
    score = 50
    keywords = {
        "[imp]": 100, "发布": 50, "release": 50, "上线": 50,
        "修复": 30, "fix": 30, "bug": 30, "架构": 40, "重构": 40,
        "完成": 25, "成功": 20,
        "测试": -20, "调试": -15, "临时": -25,
    }
    
    for kw, pts in keywords.items():
        if kw in content:
            score += pts
    
    if re.search(r'v\d+\.\d+', content):
        score += 30
    
    return score


def smart_cleanup():
    """智能清理低分快照（v2.1：优先删除低重要性）"""
    if not FULL_MEMORY_DIR.exists():
        return ""
    
    deleted = 0
    
    for proj_dir in FULL_MEMORY_DIR.iterdir():
        if not proj_dir.is_dir():
            continue
        
        files = []
        for f in proj_dir.glob("snapshot-*.md"):
            content = f.read_text(encoding="utf-8")
            
            # 跳过 [IMP] 标记的
            if "[IMP]" in content:
                continue
            
            # 解析重要性等级
            importance_match = re.search(r'重要性:.*?(CRITICAL|HIGH|MEDIUM|LOW|TEMP)', content)
            if importance_match:
                imp_level = importance_match.group(1)
                imp_score = IMPORTANCE_LEVELS.get(imp_level, {}).get("score", 3)
            else:
                # 旧格式快照，使用原有评分
                imp_score = calculate_importance_score(f) / 20  # 归一化到1-5
            
            files.append((imp_score, f))
        
        if len(files) > MAX_FULL_MEMORY:
            # 按重要性评分排序（低分优先删除）
            files.sort(key=lambda x: x[0])
            for score, f in files[:len(files) - MAX_FULL_MEMORY]:
                # 只删除 TEMP 和 LOW 级别的
                if score <= 2:
                    f.unlink()
                    deleted += 1
    
    return f"🧹 清理 {deleted} 条（低重要性）" if deleted > 0 else ""


# ============ MCP 工具定义 ============

@server.list_tools()
async def list_tools():
    return [
        Tool(
            name="save_snapshot",
            description="保存快照（自动更新全局记忆+项目记忆+智能评估）",
            inputSchema={
                "type": "object",
                "properties": {
                    "project": {"type": "string", "description": "项目名称"},
                    "summary": {"type": "string", "description": "简短总结"},
                    "details": {"type": "string", "description": "详细内容"},
                    "files": {"type": "string", "description": "修改文件，逗号分隔"},
                    "tags": {"type": "string", "description": "标签，逗号分隔"},
                    "version": {"type": "string", "description": "版本号"},
                    "importance": {"type": "string", "description": "重要性等级（auto/CRITICAL/HIGH/MEDIUM/LOW/TEMP）", "default": "auto"}
                },
                "required": ["project", "summary"]
            }
        ),
        Tool(
            name="load_memory",
            description="加载记忆（全局+项目记忆，按需加载完整记忆）",
            inputSchema={
                "type": "object",
                "properties": {
                    "project": {"type": "string", "description": "指定项目加载完整记忆"}
                }
            }
        ),
        Tool(
            name="get_status",
            description="获取 SnapMind 系统状态",
            inputSchema={"type": "object", "properties": {}}
        ),
        Tool(
            name="search_history",
            description="搜索历史快照（支持时间/项目/标签过滤）",
            inputSchema={
                "type": "object",
                "properties": {
                    "keyword": {"type": "string", "description": "搜索关键词"},
                    "project": {"type": "string", "description": "限定项目"},
                    "tag": {"type": "string", "description": "限定标签"},
                    "days": {"type": "integer", "description": "最近N天"}
                },
                "required": ["keyword"]
            }
        ),
        Tool(
            name="check_health",
            description="检查 SnapMind 记忆健康度",
            inputSchema={"type": "object", "properties": {}}
        ),
        Tool(
            name="merge_memory",
            description="合并相似快照",
            inputSchema={
                "type": "object",
                "properties": {
                    "project": {"type": "string", "description": "项目名称"},
                    "start_num": {"type": "integer", "description": "起始序号"},
                    "end_num": {"type": "integer", "description": "结束序号"}
                },
                "required": ["project", "start_num", "end_num"]
            }
        ),
        Tool(
            name="export_memory",
            description="导出记忆包（ZIP）",
            inputSchema={
                "type": "object",
                "properties": {
                    "project": {"type": "string", "description": "指定项目，留空导出全部"},
                    "output_path": {"type": "string", "description": "输出路径"}
                }
            }
        ),
        Tool(
            name="import_memory",
            description="导入记忆包",
            inputSchema={
                "type": "object",
                "properties": {
                    "zip_path": {"type": "string", "description": "ZIP文件路径"}
                },
                "required": ["zip_path"]
            }
        ),
        Tool(
            name="set_config",
            description="设置 SnapMind 配置（活跃期、冷藏期等）",
            inputSchema={
                "type": "object",
                "properties": {
                    "active_days": {"type": "integer", "description": "活跃期天数（默认30）"},
                    "archive_days": {"type": "integer", "description": "冷藏期天数（默认30，超过后自动删除）"},
                    "max_full_memory": {"type": "integer", "description": "完整快照最大数量（默认50）"},
                    "project_memory_items": {"type": "integer", "description": "项目记忆保留条数（默认10）"}
                }
            }
        ),
        Tool(
            name="get_config",
            description="获取当前 SnapMind 配置",
            inputSchema={"type": "object", "properties": {}}
        )
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict):
    handlers = {
        "save_snapshot": save_snapshot,
        "load_memory": load_memory,
        "get_status": get_status,
        "search_history": search_history,
        "check_health": check_health,
        "merge_memory": merge_memory,
        "export_memory": export_memory,
        "import_memory": import_memory,
        "set_config": set_config_handler,
        "get_config": get_config_handler,
    }
    
    handler = handlers.get(name)
    if handler:
        return await handler(arguments)
    return [TextContent(type="text", text=f"未知工具: {name}")]


# ============ 工具实现 ============

async def save_snapshot(args: dict):
    """保存快照（v2.1：智能评估+Token预算控制）"""
    project = args.get("project", "General")
    summary = args.get("summary", "")
    details = args.get("details", "")
    files = args.get("files", "")
    tags = args.get("tags", project)
    version = args.get("version", "")
    importance_input = args.get("importance", "auto")
    
    ensure_dirs(project)
    
    index = get_current_index() + 1
    set_current_index(index)
    
    # 智能评估重要性
    if importance_input.lower() == "auto":
        importance, precision, reason = auto_evaluate_importance(summary, details, tags, version)
    else:
        importance = importance_input.upper()
        if importance not in IMPORTANCE_LEVELS:
            importance = "MEDIUM"
        precision = "B"
        reason = "手动指定"
    
    imp_config = IMPORTANCE_LEVELS[importance]
    
    # 自动 [IMP] 标签（CRITICAL 和 HIGH 自动添加）
    all_content = f"{summary} {details} {tags}".lower()
    if importance in ["CRITICAL", "HIGH"] or any(kw in all_content for kw in ["重要", "别删", "重构", "发布"]):
        if "[imp]" not in tags.lower():
            tags = f"{tags}, [IMP]" if tags else "[IMP]"
    
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    idx = f"{index:03d}"
    
    # 构建快照内容
    snapshot_content = f"""# 快照 #{idx} - {project}
> 日期: {now}{f' | 版本: {version}' if version else ''}
> 重要性: {imp_config['emoji']} {importance}（{reason}）
> 精准度: {precision}级（{get_precision_description(precision)}）

## 📋 本次工作
{details if details else summary}

## 📁 修改文件
{files if files else "（未指定）"}

## 🏷️ 标签
{tags}
"""
    
    # Token 预算控制
    token_count = estimate_tokens(snapshot_content)
    max_tokens = TOKEN_BUDGET["full"][1]
    
    if token_count > max_tokens:
        # 截断详情部分
        truncated_details = truncate_to_budget(details if details else summary, max_tokens - 500)
        snapshot_content = f"""# 快照 #{idx} - {project}
> 日期: {now}{f' | 版本: {version}' if version else ''}
> 重要性: {imp_config['emoji']} {importance}（{reason}）
> 精准度: {precision}级（{get_precision_description(precision)}）
> ⚠️ 已截断（原 {token_count} tokens → {max_tokens} tokens）

## 📋 本次工作
{truncated_details}

## 📁 修改文件
{files if files else "（未指定）"}

## 🏷️ 标签
{tags}
"""
        token_count = estimate_tokens(snapshot_content)
    
    (FULL_MEMORY_DIR / project / f"snapshot-{idx}.md").write_text(snapshot_content, encoding="utf-8")
    
    # 更新项目记忆（累积式）
    update_project_memory(project, summary, version, files, tags)
    
    # 更新全局记忆
    update_global_memory(project, summary, version, "🔧")
    
    # 信号文件
    signal_file = KIRO_DIR / "trigger-save-and-new.txt"
    try:
        signal_file.write_text(f"saved at {now}", encoding="utf-8")
        signal_msg = "✅ 信号已写入"
    except Exception as e:
        signal_msg = f"❌ 信号失败: {e}"
    
    # 定期维护
    maintenance = []
    if index % CLEANUP_INTERVAL == 0:
        archive_msg = auto_archive()
        cleanup_msg = smart_cleanup()
        if archive_msg:
            maintenance.append(archive_msg)
        if cleanup_msg:
            maintenance.append(cleanup_msg)
    
    # 更新关键词索引
    update_keyword_index(project, idx, summary, details, files, tags)
    
    # 计算保留期限
    retention_days = imp_config["retention_days"]
    if retention_days >= 365:
        retention_str = "永久"
    else:
        retention_str = f"{retention_days}天"
    
    return [TextContent(type="text", text=f"""✅ 快照 #{idx} 保存成功

📊 记忆评估
- 重要性：{imp_config['emoji']} {importance}（{reason}）
- 精准度：{precision}级（{get_precision_description(precision)}）
- Token 消耗：{token_count} (~{token_count/200000*100:.2f}%)
- 保留期限：{retention_str}

📁 更新状态
- 项目: {project}
- 摘要: {summary[:50]}...
- 项目记忆: 已更新 ✅
- 全局记忆: 已更新 ✅
- 关键词索引: 已更新 ✅
- {signal_msg}
{chr(10).join(maintenance)}""")]


async def load_memory(args: dict):
    """加载记忆（新架构：全局+项目记忆+按需完整记忆）"""
    target_project = args.get("project", "")
    parts = []
    
    # 1. 全局记忆（必读）
    if GLOBAL_MEMORY_FILE.exists():
        parts.append("## 🌐 全局记忆\n")
        parts.append(GLOBAL_MEMORY_FILE.read_text(encoding="utf-8"))
        parts.append("\n---\n")
    
    # 2. 所有项目记忆（核心改进：累积式）
    if PROJECTS_DIR.exists():
        project_files = list(PROJECTS_DIR.glob("*.md"))
        if project_files:
            parts.append("## 📁 项目记忆\n")
            for pf in sorted(project_files):
                parts.append(pf.read_text(encoding="utf-8"))
                parts.append("\n---\n")
    
    # 3. 如果指定项目，加载该项目最新完整记忆
    if target_project:
        proj_dir = FULL_MEMORY_DIR / target_project
        if proj_dir.exists():
            snapshots = [(get_file_num(f), f) for f in proj_dir.glob("snapshot-*.md")]
            if snapshots:
                snapshots.sort(key=lambda x: x[0], reverse=True)
                parts.append(f"## 📸 {target_project} 最新快照\n")
                parts.append(snapshots[0][1].read_text(encoding="utf-8"))
                parts.append("\n")
    else:
        # 未指定项目时，加载最新1条完整记忆
        all_snapshots = []
        if FULL_MEMORY_DIR.exists():
            for d in FULL_MEMORY_DIR.iterdir():
                if d.is_dir():
                    for f in d.glob("snapshot-*.md"):
                        all_snapshots.append((get_file_num(f), f))
        
        if all_snapshots:
            all_snapshots.sort(key=lambda x: x[0], reverse=True)
            parts.append("## 📸 最新快照\n")
            parts.append(all_snapshots[0][1].read_text(encoding="utf-8"))
            parts.append("\n")
    
    if not parts:
        return [TextContent(type="text", text="暂无历史记忆")]
    
    return [TextContent(type="text", text="".join(parts))]


async def get_status(args: dict):
    """获取系统状态"""
    index = get_current_index()
    config = load_config()
    
    s_count = sum(1 for _ in FULL_MEMORY_DIR.rglob("snapshot-*.md")) if FULL_MEMORY_DIR.exists() else 0
    p_count = len(list(PROJECTS_DIR.glob("*.md"))) if PROJECTS_DIR.exists() else 0
    a_count = sum(1 for _ in ARCHIVE_DIR.rglob("snapshot-*.md")) if ARCHIVE_DIR.exists() else 0
    
    projects = set()
    if FULL_MEMORY_DIR.exists():
        for d in FULL_MEMORY_DIR.iterdir():
            if d.is_dir() and any(d.glob("snapshot-*.md")):
                projects.add(d.name)
    
    active_days = config.get("active_days", 30)
    archive_days = config.get("archive_days", 30)
    total_days = active_days + archive_days
    
    return [TextContent(type="text", text=f"""📊 SnapMind v2.1.00 状态

📁 存储统计：
• 当前序号: {index}
• 完整快照: {s_count}/{config.get('max_full_memory', 50)}
• 项目记忆: {p_count} 个项目
• 归档快照: {a_count} 条
• 活跃项目: {', '.join(sorted(projects)) if projects else '（无）'}

⏱️ 生命周期：
• 活跃期: {active_days} 天
• 冷藏期: {archive_days} 天
• 总生命周期: {total_days} 天（超过后自动删除）

📏 Token 预算：
• 项目记忆: {TOKEN_BUDGET['project'][0]}-{TOKEN_BUDGET['project'][1]}
• 完整快照: {TOKEN_BUDGET['full'][0]}-{TOKEN_BUDGET['full'][1]}

📂 工作目录: {KIRO_DIR}""")]


async def search_history(args: dict):
    """搜索历史快照（含归档）"""
    keyword = args.get("keyword", "").lower()
    project_filter = args.get("project", "")
    tag_filter = args.get("tag", "").lower()
    days = args.get("days", 0)
    
    if not keyword:
        return [TextContent(type="text", text="请提供搜索关键词")]
    
    results = []
    cutoff_time = (datetime.now() - timedelta(days=days)).timestamp() if days > 0 else 0
    
    # 搜索活跃快照和归档
    search_dirs = [FULL_MEMORY_DIR, ARCHIVE_DIR]
    
    for base_dir in search_dirs:
        if not base_dir.exists():
            continue
        
        is_archive = base_dir == ARCHIVE_DIR
        
        for proj_dir in base_dir.iterdir():
            if not proj_dir.is_dir():
                continue
            
            if project_filter and proj_dir.name.lower() != project_filter.lower():
                continue
            
            for f in proj_dir.glob("snapshot-*.md"):
                if cutoff_time > 0 and f.stat().st_mtime < cutoff_time:
                    continue
                
                content = f.read_text(encoding="utf-8")
                content_lower = content.lower()
                
                if keyword not in content_lower:
                    continue
                
                if tag_filter and tag_filter not in content_lower:
                    continue
                
                prefix = "[归档] " if is_archive else ""
                lines = content.split("\n")
                summary = next((l[:50] for l in lines if l.startswith("- ") or (l and not l.startswith("#") and not l.startswith(">"))), "")
                
                results.append(f"- {prefix}{proj_dir.name}/{f.name}: {summary}...")
    
    if not results:
        return [TextContent(type="text", text=f"未找到包含 '{keyword}' 的快照")]
    
    return [TextContent(type="text", text=f"🔍 搜索结果（{len(results)} 条）:\n" + "\n".join(results[:20]))]


async def check_health(args: dict):
    """检查记忆健康度"""
    score = 100
    passed, warnings, errors = [], [], []
    
    # 1. 全局记忆
    if GLOBAL_MEMORY_FILE.exists():
        passed.append("全局记忆存在")
    else:
        errors.append("全局记忆不存在")
        score -= 20
    
    # 2. 项目记忆
    p_count = len(list(PROJECTS_DIR.glob("*.md"))) if PROJECTS_DIR.exists() else 0
    if p_count >= 3:
        passed.append(f"项目记忆完整（{p_count}个）")
        score += 5
    elif p_count > 0:
        passed.append(f"项目记忆存在（{p_count}个）")
    else:
        warnings.append("没有项目记忆")
        score -= 10
    
    # 3. 技术决策
    if TECH_DECISIONS_FILE.exists():
        content = TECH_DECISIONS_FILE.read_text(encoding="utf-8")
        count = len(re.findall(r'### \[D', content))
        if count >= 5:
            passed.append(f"决策日志完整（{count}条）")
            score += 5
        else:
            warnings.append(f"决策较少（{count}条）")
    else:
        errors.append("决策日志不存在")
        score -= 15
    
    # 4. 快照数量
    s_count = sum(1 for _ in FULL_MEMORY_DIR.rglob("snapshot-*.md")) if FULL_MEMORY_DIR.exists() else 0
    if s_count >= 10:
        passed.append(f"快照充足（{s_count}条）")
        score += 5
    elif s_count > 0:
        passed.append(f"快照存在（{s_count}条）")
    else:
        errors.append("没有快照")
        score -= 15
    
    # 5. 更新频率
    latest = None
    if FULL_MEMORY_DIR.exists():
        for f in FULL_MEMORY_DIR.rglob("snapshot-*.md"):
            mtime = f.stat().st_mtime
            if latest is None or mtime > latest:
                latest = mtime
    
    if latest:
        days = (datetime.now().timestamp() - latest) / 86400
        if days <= 3:
            passed.append(f"最近{int(days)}天有更新")
            score += 5
        elif days <= 7:
            passed.append(f"最近{int(days)}天有更新")
        elif days <= 30:
            warnings.append(f"已{int(days)}天未更新")
            score -= 10
        else:
            errors.append(f"已{int(days)}天未更新")
            score -= 25
    
    # 6. #temp 标签
    temp_count = 0
    if FULL_MEMORY_DIR.exists():
        for f in FULL_MEMORY_DIR.rglob("snapshot-*.md"):
            if "#temp" in f.read_text(encoding="utf-8").lower():
                temp_count += 1
    
    if temp_count == 0:
        passed.append("无临时代码")
    else:
        warnings.append(f"{temp_count}个#temp未清理")
        score -= temp_count * 5
    
    score = max(0, min(100, score))
    
    if score >= 90:
        grade, status = "A", "✅ 优秀"
    elif score >= 75:
        grade, status = "B", "✅ 良好"
    elif score >= 60:
        grade, status = "C", "⚠️ 一般"
    elif score >= 40:
        grade, status = "D", "⚠️ 较差"
    else:
        grade, status = "F", "❌ 危险"
    
    report = f"📊 SnapMind 健康度：{score}% {grade}级 {status}\n\n"
    
    if passed:
        report += "✅ 通过：\n" + "\n".join(f"• {p}" for p in passed) + "\n\n"
    if warnings:
        report += "⚠️ 警告：\n" + "\n".join(f"• {w}" for w in warnings) + "\n\n"
    if errors:
        report += "❌ 问题：\n" + "\n".join(f"• {e}" for e in errors) + "\n\n"
    
    return [TextContent(type="text", text=report)]


async def merge_memory(args: dict):
    """合并快照"""
    project = args.get("project", "")
    start_num = args.get("start_num", 0)
    end_num = args.get("end_num", 0)
    
    if not project or start_num >= end_num:
        return [TextContent(type="text", text="请提供有效的项目名和序号范围")]
    
    proj_dir = FULL_MEMORY_DIR / project
    if not proj_dir.exists():
        return [TextContent(type="text", text=f"项目 {project} 不存在")]
    
    to_merge = []
    for f in proj_dir.glob("snapshot-*.md"):
        num = get_file_num(f)
        if start_num <= num <= end_num:
            to_merge.append((num, f))
    
    if len(to_merge) < 2:
        return [TextContent(type="text", text="需要至少2个快照才能合并")]
    
    to_merge.sort(key=lambda x: x[0])
    
    merged_work, merged_files, merged_tags = [], set(), set()
    
    for num, f in to_merge:
        content = f.read_text(encoding="utf-8")
        
        if "## 📋 本次工作" in content:
            work = content.split("## 📋 本次工作")[1].split("##")[0].strip()
            merged_work.append(f"### #{num:03d}\n{work}")
        
        if "## 📁 修改文件" in content:
            files = content.split("## 📁 修改文件")[1].split("##")[0].strip()
            for line in files.split("\n"):
                if line.strip() and line.strip() != "（未指定）":
                    merged_files.add(line.strip())
        
        if "## 🏷️ 标签" in content:
            tags = content.split("## 🏷️ 标签")[1].split("##")[0].strip()
            for tag in tags.replace(",", " ").split():
                merged_tags.add(tag.strip())
    
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    merged_content = f"""# 合并快照 #{start_num:03d}-{end_num:03d} - {project}
> 日期: {now} | 合并自 {len(to_merge)} 个快照

## 📋 合并工作内容
{chr(10).join(merged_work)}

## 📁 涉及文件
{chr(10).join(sorted(merged_files)) if merged_files else "（未指定）"}

## 🏷️ 标签
{', '.join(sorted(merged_tags))}
"""
    
    merged_path = proj_dir / f"snapshot-{start_num:03d}-{end_num:03d}-merged.md"
    merged_path.write_text(merged_content, encoding="utf-8")
    
    deleted = 0
    for num, f in to_merge:
        f.unlink()
        deleted += 1
    
    return [TextContent(type="text", text=f"""✅ 合并完成
- 项目: {project}
- 范围: #{start_num:03d} - #{end_num:03d}
- 合并: {deleted} → 1
- 输出: {merged_path.name}""")]


async def export_memory(args: dict):
    """导出记忆包"""
    project = args.get("project", "")
    output_path = args.get("output_path", "")
    
    now = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    if not output_path:
        name = f"SnapMind-{project}-{now}.zip" if project else f"SnapMind-全部-{now}.zip"
        output_path = str(WORKSPACE_ROOT / name)
    
    try:
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            # 全局记忆
            if GLOBAL_MEMORY_FILE.exists():
                zf.write(GLOBAL_MEMORY_FILE, "memory/global/global-memory.md")
            
            # 技术决策
            if TECH_DECISIONS_FILE.exists():
                zf.write(TECH_DECISIONS_FILE, "memory/tech-decisions.md")
            
            # 项目记忆
            if PROJECTS_DIR.exists():
                for f in PROJECTS_DIR.glob("*.md"):
                    if project and project not in f.stem:
                        continue
                    zf.write(f, f"memory/projects/{f.name}")
            
            # 索引
            if INDEX_FILE.exists():
                zf.write(INDEX_FILE, "task-snapshot-index.txt")
            
            # 快照
            if FULL_MEMORY_DIR.exists():
                for f in FULL_MEMORY_DIR.rglob("*.md"):
                    if project and project not in str(f):
                        continue
                    rel = f.relative_to(KIRO_DIR)
                    zf.write(f, str(rel))
            
            # 归档
            if ARCHIVE_DIR.exists():
                for f in ARCHIVE_DIR.rglob("*.md"):
                    if project and project not in str(f):
                        continue
                    rel = f.relative_to(KIRO_DIR)
                    zf.write(f, str(rel))
        
        with zipfile.ZipFile(output_path, 'r') as zf:
            file_count = len(zf.namelist())
        
        size_kb = Path(output_path).stat().st_size / 1024
        
        return [TextContent(type="text", text=f"""✅ 导出成功
- 文件: {output_path}
- 大小: {size_kb:.1f} KB
- 包含: {file_count} 个文件""")]
    
    except Exception as e:
        return [TextContent(type="text", text=f"❌ 导出失败: {e}")]


async def import_memory(args: dict):
    """导入记忆包"""
    zip_path = args.get("zip_path", "")
    
    if not zip_path or not Path(zip_path).exists():
        return [TextContent(type="text", text="请提供有效的 ZIP 文件路径")]
    
    try:
        imported, skipped = 0, 0
        
        with zipfile.ZipFile(zip_path, 'r') as zf:
            for name in zf.namelist():
                target = KIRO_DIR / name
                
                if target.exists():
                    skipped += 1
                    continue
                
                target.parent.mkdir(parents=True, exist_ok=True)
                
                with zf.open(name) as src:
                    target.write_bytes(src.read())
                imported += 1
        
        return [TextContent(type="text", text=f"""✅ 导入成功
- 来源: {zip_path}
- 导入: {imported} 个
- 跳过: {skipped} 个""")]
    
    except Exception as e:
        return [TextContent(type="text", text=f"❌ 导入失败: {e}")]


async def set_config_handler(args: dict):
    """设置配置"""
    config = load_config()
    changed = []
    
    if "active_days" in args:
        old = config.get("active_days", 30)
        config["active_days"] = args["active_days"]
        changed.append(f"活跃期: {old} → {args['active_days']} 天")
    
    if "archive_days" in args:
        old = config.get("archive_days", 30)
        config["archive_days"] = args["archive_days"]
        changed.append(f"冷藏期: {old} → {args['archive_days']} 天")
    
    if "max_full_memory" in args:
        old = config.get("max_full_memory", 50)
        config["max_full_memory"] = args["max_full_memory"]
        changed.append(f"快照上限: {old} → {args['max_full_memory']} 条")
    
    if "project_memory_items" in args:
        old = config.get("project_memory_items", 10)
        config["project_memory_items"] = args["project_memory_items"]
        changed.append(f"项目记忆: {old} → {args['project_memory_items']} 条")
    
    if not changed:
        return [TextContent(type="text", text="⚠️ 未提供任何配置项")]
    
    save_config(config)
    
    # 计算总生命周期
    total_days = config.get("active_days", 30) + config.get("archive_days", 30)
    
    return [TextContent(type="text", text=f"""✅ 配置已更新

📝 修改项：
{chr(10).join(f"• {c}" for c in changed)}

📊 当前配置：
• 活跃期: {config.get('active_days', 30)} 天
• 冷藏期: {config.get('archive_days', 30)} 天
• 总生命周期: {total_days} 天（超过后自动删除）
• 快照上限: {config.get('max_full_memory', 50)} 条
• 项目记忆: {config.get('project_memory_items', 10)} 条""")]


async def get_config_handler(args: dict):
    """获取当前配置"""
    config = load_config()
    
    total_days = config.get("active_days", 30) + config.get("archive_days", 30)
    
    return [TextContent(type="text", text=f"""📊 SnapMind 配置

⏱️ 生命周期设置：
• 活跃期: {config.get('active_days', 30)} 天（正常读取）
• 冷藏期: {config.get('archive_days', 30)} 天（归档中，可搜索）
• 总生命周期: {total_days} 天（超过后自动删除）

📦 存储设置：
• 完整快照上限: {config.get('max_full_memory', 50)} 条
• 项目记忆条数: {config.get('project_memory_items', 10)} 条
• 清理间隔: 每 {config.get('cleanup_interval', 10)} 次保存

💡 提示：使用 set_config 工具修改配置
   例如：set_config(active_days=60, archive_days=30)""")]


# ============ 服务器入口 ============

async def run_server():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


def main():
    import asyncio
    asyncio.run(run_server())


if __name__ == "__main__":
    main()


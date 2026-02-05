"""测试 SnapRing MCP Server 功能"""

import asyncio
import sys
import os

# 添加路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from snapring_mcp.server import (
    save_snapshot, load_memory, get_status, search_history,
    KIRO_DIR, MEMORY_DIR, SNAPSHOTS_DIR
)


async def test_all():
    """测试所有功能"""
    print("=" * 50)
    print("🧪 SnapRing MCP Server 功能测试")
    print("=" * 50)
    
    # 1. 测试 get_status
    print("\n📊 测试 get_status...")
    result = await get_status({})
    print(result[0].text)
    
    # 2. 测试 save_snapshot
    print("\n💾 测试 save_snapshot...")
    result = await save_snapshot({
        "project": "Test",
        "summary": "MCP Server 功能测试",
        "details": "测试 save_snapshot 工具是否正常工作",
        "files": "test_server.py",
        "tags": "test, mcp"
    })
    print(result[0].text)
    
    # 3. 测试 load_memory
    print("\n📖 测试 load_memory...")
    result = await load_memory({})
    # 只打印前 500 字符
    text = result[0].text
    if len(text) > 500:
        print(text[:500] + "\n... (截断)")
    else:
        print(text)
    
    # 4. 测试 search_history
    print("\n🔍 测试 search_history...")
    result = await search_history({"keyword": "test"})
    print(result[0].text)
    
    print("\n" + "=" * 50)
    print("✅ 所有测试完成！")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(test_all())

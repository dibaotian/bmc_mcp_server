#!/bin/bash

echo "================================================"
echo "BMC MCP Server 状态检查"
echo "================================================"
echo ""

# 1. 检查 Node.js 版本
echo "1️⃣  检查 Node.js 版本..."
NODE_VERSION=$(node --version 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "✅ Node.js 版本: $NODE_VERSION"
else
    echo "❌ 未安装 Node.js 或不在 PATH 中"
    exit 1
fi
echo ""

# 2. 检查依赖包
echo "2️⃣  检查依赖包..."
if [ -d "node_modules" ]; then
    echo "✅ node_modules 目录存在"
    if [ -d "node_modules/@modelcontextprotocol" ]; then
        echo "✅ MCP SDK 已安装"
    else
        echo "⚠️  MCP SDK 未找到，运行: npm install"
    fi
else
    echo "❌ node_modules 目录不存在，请运行: npm install"
fi
echo ""

# 3. 检查主文件
echo "3️⃣  检查主文件..."
if [ -f "index.js" ]; then
    echo "✅ index.js 文件存在"
    if [ -x "index.js" ]; then
        echo "✅ index.js 具有执行权限"
    else
        echo "⚠️  index.js 无执行权限，添加权限: chmod +x index.js"
    fi
else
    echo "❌ index.js 文件不存在"
    exit 1
fi
echo ""

# 4. 检查配置文件示例
echo "4️⃣  检查配置文件..."
if [ -f "cline-config-example.json" ]; then
    echo "✅ 配置示例文件存在"
    echo "   配置文件路径参考:"
    echo "   ~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json"
else
    echo "⚠️  配置示例文件不存在"
fi
echo ""

# 5. 测试 MCP Server 启动
echo "5️⃣  测试 MCP Server 启动..."
echo "   启动 server (3秒后自动关闭)..."

# 使用 timeout 命令运行 server，3秒后自动终止
timeout 3s node index.js 2>&1 | grep -i "running" > /dev/null
if [ $? -eq 0 ]; then
    echo "✅ MCP Server 可以成功启动"
else
    echo "⚠️  无法确认 server 启动状态 (可能需要配置 BMC 连接信息)"
fi
echo ""

echo "================================================"
echo "检查完成！"
echo "================================================"
echo ""
echo "📖 下一步操作："
echo "   1. 查看配置指南: cat README.md"
echo "   2. 查看测试指南: cat TESTING.md"
echo "   3. 配置 Cline MCP settings"
echo "   4. 在 Cline 中测试工具调用"
echo ""

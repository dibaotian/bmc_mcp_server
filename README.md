# BMC MCP Server

基于 Redfish 协议的服务器带外管理 MCP Server，支持电源控制和状态查询。

## 功能特性

### 电源管理
- ✅ 获取服务器电源状态
- ✅ 开启服务器电源
- ✅ 强制关闭服务器电源
- ✅ 重启服务器
- ✅ 优雅关机
- ✅ 优雅重启

### 硬件监控
- ✅ 获取启动进度状态
- ✅ 获取电源供应（PSU）状态
- ✅ 获取功耗监控数据
- ✅ 获取温度传感器数据
- ✅ 获取风扇状态

### PCIe 设备管理
- ✅ 获取所有 PCIe 设备信息
- ✅ 获取指定 Slot PCIe 设备信息

### 其他
- ✅ Session 自动管理
- ✅ 新旧 API 自动降级

## 安装

```bash
cd mcp/bmc-server
npm install
```

## 配置

### 方式 1: 环境变量（推荐）

在 Cline MCP 配置中设置环境变量：

```json
{
  "mcpServers": {
    "bmc": {
      "command": "node",
      "args": ["/home/xilinx/Documents/arnic_eng/mcp/bmc-server/index.js"],
    }
  }
}
```

### 方式 2: 工具调用时传递参数

如果不设置环境变量，可以在调用工具时传递 BMC 连接信息：

```json
{
  "bmc_ip": "192.168.1.100",
  "username": "USERID",
  "password": "YourPassword"
}
```

## 可用工具

### 1. get_power_state
获取服务器电源状态和系统信息

**参数：**
- `bmc_ip` (必需): BMC IP 地址
- `username` (可选): BMC 用户名，默认为 "USERID"
- `password` (必需): BMC 密码

**返回示例：**
```json
{
  "PowerState": "On",
  "Status": {
    "State": "Enabled",
    "Health": "OK"
  },
  "Model": "Server Model",
  "SerialNumber": "SN123456",
  "BiosVersion": "1.0.0"
}
```

### 2. power_on
开启服务器电源

**参数：**
- `bmc_ip` (必需): BMC IP 地址
- `username` (可选): BMC 用户名
- `password` (必需): BMC 密码

### 3. power_off
强制关闭服务器电源（ForceOff）

**参数：**
- `bmc_ip` (必需): BMC IP 地址
- `username` (可选): BMC 用户名
- `password` (必需): BMC 密码

### 4. power_cycle
重启服务器电源（通过 ForceOff + On 实现）

**参数：**
- `bmc_ip` (必需): BMC IP 地址
- `username` (可选): BMC 用户名
- `password` (必需): BMC 密码

**说明：**
由于部分 BMC 不支持直接的 PowerCycle 命令，此工具通过执行以下步骤实现电源循环：
1. ForceOff - 强制关闭电源
2. 等待 2 秒
3. On - 开启电源

### 5. graceful_shutdown
优雅关闭服务器（需要操作系统支持）

**参数：**
- `bmc_ip` (必需): BMC IP 地址
- `username` (可选): BMC 用户名
- `password` (必需): BMC 密码

### 6. graceful_restart
优雅重启服务器（需要操作系统支持）

**参数：**
- `bmc_ip` (必需): BMC IP 地址
- `username` (可选): BMC 用户名
- `password` (必需): BMC 密码

### 7. get_pcie_devices
获取服务器所有 PCIe 设备信息

**参数：**
- `bmc_ip` (必需): BMC IP 地址
- `username` (可选): BMC 用户名
- `password` (必需): BMC 密码

**返回示例：**
```json
{
  "DeviceCount": 6,
  "Devices": [
    {
      "Id": "slot_5",
      "Name": "N/A",
      "Manufacturer": "AMD",
      "Model": "N/A",
      "DeviceType": "MultiFunction",
      "Status": {
        "State": "Enabled",
        "Health": "OK"
      },
      "PCIeInterface": {
        "PCIeType": "Gen5",
        "LanesInUse": 16,
        "MaxLanes": 16
      }
    }
  ]
}
```

### 8. get_pcie_device_by_slot
获取指定 Slot 的 PCIe 设备详细信息

**参数：**
- `bmc_ip` (必需): BMC IP 地址
- `slot_id` (必需): Slot ID，支持多种格式：
  - 数字格式：`"3"`, `"5"`, `"13"`
  - 完整格式：`"slot_3"`, `"slot_5"`
  - 板载设备：`"ob_1"`, `"ob_2"`
- `username` (可选): BMC 用户名
- `password` (必需): BMC 密码

**返回示例：**
```json
{
  "Id": "slot_5",
  "Name": "N/A",
  "Manufacturer": "AMD",
  "Model": "N/A",
  "DeviceType": "MultiFunction",
  "Status": {
    "State": "Enabled",
    "Health": "OK"
  },
  "PCIeInterface": {
    "PCIeType": "Gen5",
    "LanesInUse": 16,
    "MaxLanes": 16
  },
  "Links": {},
  "Oem": {}
}
```

**错误处理：**
如果设备不存在，会提示可用的设备 ID 列表：
```
Error: Device 'slot_99' not found. Available devices: slot_3, slot_5, slot_13, ob_1, ob_2, ob_4
```

### 9. get_boot_progress
获取服务器启动进度状态

**参数：**
- `bmc_ip` (必需): BMC IP 地址
- `username` (可选): BMC 用户名
- `password` (必需): BMC 密码

**返回示例：**
```json
{
  "PowerState": "On",
  "BootProgress": {
    "LastState": "OSRunning",
    "OemLastState": "FullyInitializedInOS"
  },
  "Status": {
    "State": "Enabled",
    "Health": "OK",
    "HealthRollup": "OK"
  },
  "Boot": {
    "BootSourceOverrideEnabled": "Disabled",
    "BootSourceOverrideTarget": "None",
    "BootSourceOverrideMode": "UEFI",
    "BootOrder": ["Boot0000", "Boot0001", "Boot0002"]
  }
}
```

**可能的 LastState 值：**
- `None` - 无启动信息
- `PrimaryProcessorInitializationStarted` - CPU 初始化
- `MemoryInitializationStarted` - 内存初始化
- `PCIResourceConfigStarted` - PCIe 资源配置
- `SystemHardwareInitializationComplete` - 硬件初始化完成
- `OSBootStarted` - OS 启动开始
- `OSRunning` - OS 正常运行 ✅

详细说明请查看 `BOOT_PROGRESS_STATES.md`

### 10. get_power_supply_status
获取电源供应单元（PSU）状态，优先使用 PowerSubsystem 新版 API

**参数：**
- `bmc_ip` (必需): BMC IP 地址
- `username` (可选): BMC 用户名
- `password` (必需): BMC 密码

**返回示例：**
```json
{
  "ApiVersion": "PowerSubsystem (New)",
  "PowerSupplies": [...],
  "CapacityWatts": 2160,
  "Status": {"State": "Enabled", "Health": "OK"}
}
```

**实测：** SR655_V3_1 支持 PowerSubsystem 新版 API，总容量 2160W

### 11. get_power_metrics
获取功耗监控数据，使用 EnvironmentMetrics API

**参数：**
- `bmc_ip` (必需): BMC IP 地址
- `username` (可选): BMC 用户名
- `password` (必需): BMC 密码

**返回示例：**
```json
{
  "ApiVersion": "EnvironmentMetrics",
  "PowerWatts": {"Reading": 176},
  "TemperatureCelsius": {"Reading": 21}
}
```

**实测：** SR655_V3_1 支持 EnvironmentMetrics API，当前功耗 176W，环境温度 21°C

### 12. get_thermal_sensors
获取温度传感器数据，优先使用 ThermalSubsystem 新版 API

**参数：**
- `bmc_ip` (必需): BMC IP 地址
- `username` (可选): BMC 用户名
- `password` (必需): BMC 密码

**返回示例：**
```json
{
  "ApiVersion": "Thermal (Legacy)",
  "Temperatures": [
    {"Name": "CPU1 Temp", "ReadingCelsius": 45, "Status": {"Health": "OK"}},
    {"Name": "Ambient Temp", "ReadingCelsius": 21, "Status": {"Health": "OK"}}
  ]
}
```

**实测：** SR655_V3_1 同时支持新旧 API，提供 16 个温度传感器详细数据

### 13. get_fan_status
获取风扇状态和转速，优先使用 ThermalSubsystem/Fans 新版 API

**参数：**
- `bmc_ip` (必需): BMC IP 地址
- `username` (可选): BMC 用户名
- `password` (必需): BMC 密码

**返回示例：**
```json
{
  "ApiVersion": "Thermal (Legacy)",
  "FanCount": 12,
  "Fans": [
    {"Name": "Fan1A", "Reading": 4500, "ReadingUnits": "RPM", "Status": {"Health": "OK"}},
    {"Name": "Fan1B", "Reading": 4600, "ReadingUnits": "RPM", "Status": {"Health": "OK"}}
  ]
}
```

**实测：** SR655_V3_1 同时支持新旧 API，提供 12 个风扇的详细数据

## 使用示例

### 在 Cline 中使用

配置好 MCP server 后，你可以在 Cline 中直接使用自然语言控制服务器：

```
"查询服务器 192.168.1.100 的电源状态"
"开启服务器电源"
"关闭服务器"
"重启服务器"
```

### 手动测试

```bash
# 运行 server
node index.js

# 然后通过 stdin/stdout 进行 MCP 协议通信
```

## 支持的 Redfish ResetType

- `On`: 开机
- `ForceOff`: 强制关机
- `PowerCycle`: 电源循环（重启）
- `GracefulShutdown`: 优雅关机
- `GracefulRestart`: 优雅重启
- `ForceRestart`: 强制重启
- `Nmi`: 发送 NMI (Non-Maskable Interrupt)

## 安全注意事项

⚠️ **重要提示：**

1. 默认配置禁用了 SSL 证书验证（`rejectUnauthorized: false`），这适用于测试环境
2. 生产环境建议：
   - 启用 SSL 证书验证
   - 使用强密码
   - 限制网络访问
   - 定期更新 BMC 固件

## 故障排除

### 连接失败
- 检查 BMC IP 地址是否正确
- 确认 BMC 网络可达（ping 测试）
- 验证用户名和密码

### 命令执行失败
- 检查 BMC 是否支持该 ResetType
- 查看 BMC 日志
- 确认用户权限足够

### SSL 证书错误
如需启用证书验证，修改 `index.js` 中的：
```javascript
const agent = new https.Agent({
  rejectUnauthorized: true  // 启用证书验证
});
```

## 技术栈

- Node.js
- MCP SDK (@modelcontextprotocol/sdk)
- Redfish API
- node-fetch

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！

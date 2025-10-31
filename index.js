#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import https from "https";

// 禁用 SSL 证书验证（生产环境建议启用）
const agent = new https.Agent({
  rejectUnauthorized: false
});

// BMC 配置（从环境变量读取）
const BMC_IP = process.env.BMC_IP || "";
const BMC_USER = process.env.BMC_USER || "USERID";
const BMC_PASSWORD = process.env.BMC_PASSWORD || "";

// Session 管理
let sessionToken = null;
let sessionLocation = null;

/**
 * 检测 BMC 厂商和认证方式
 */
async function detectBmcVendor(bmcIp) {
  try {
    const url = `https://${bmcIp}/redfish/v1`;
    const response = await fetch(url, { agent });
    
    if (response.ok) {
      const data = await response.json();
      // Dell iDRAC 通常在 Oem 中有 Dell 标识
      if (data.Oem && (data.Oem.Dell || data.Oem.dell)) {
        return { vendor: 'Dell', authMethod: 'basic' };
      }
      // Lenovo XCC
      if (data.Oem && (data.Oem.Lenovo || data.Oem.lenovo)) {
        return { vendor: 'Lenovo', authMethod: 'session' };
      }
    }
  } catch (error) {
    // 如果检测失败，默认使用 Session 认证
  }
  
  return { vendor: 'Unknown', authMethod: 'session' };
}

/**
 * 获取认证 Headers
 */
async function getAuthHeaders(bmcIp, username, password) {
  // 检测厂商和认证方式
  const { vendor, authMethod } = await detectBmcVendor(bmcIp);
  
  if (authMethod === 'basic' || vendor === 'Dell') {
    // Dell iDRAC 使用 Basic Auth
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    return {
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      cleanup: async () => {}, // Basic Auth 无需清理
      vendor
    };
  } else {
    // Lenovo 和其他使用 Session Auth
    const session = await createSession(bmcIp, username, password);
    return {
      headers: {
        "X-Auth-Token": session.token,
        "Content-Type": "application/json"
      },
      cleanup: async () => await deleteSession(bmcIp, session.token, session.location),
      vendor
    };
  }
}

/**
 * 自动检测 System ID
 */
async function detectSystemId(bmcIp, headers) {
  try {
    const url = `https://${bmcIp}/redfish/v1/Systems`;
    const response = await fetch(url, { headers, agent });
    
    if (response.ok) {
      const data = await response.json();
      if (data.Members && data.Members.length > 0) {
        const systemPath = data.Members[0]['@odata.id'];
        // 提取最后一部分，可能是 "1" 或 "System.Embedded.1"
        return systemPath.split('/').pop();
      }
    }
  } catch (error) {
    // 检测失败，返回默认值
  }
  
  return "1"; // 默认值
}

/**
 * 创建 Redfish Session（仅用于 Session 认证）
 */
async function createSession(bmcIp, username, password) {
  const url = `https://${bmcIp}/redfish/v1/SessionService/Sessions`;
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        UserName: username,
        Password: password
      }),
      agent
    });

    if (!response.ok) {
      throw new Error(`Session creation failed: ${response.status} ${response.statusText}`);
    }

    const token = response.headers.get("X-Auth-Token");
    const location = response.headers.get("Location");

    return { token, location };
  } catch (error) {
    throw new Error(`Failed to create session: ${error.message}`);
  }
}

/**
 * 删除 Redfish Session
 */
async function deleteSession(bmcIp, token, location) {
  if (!location) return;

  const url = `https://${bmcIp}${location}`;
  
  try {
    await fetch(url, {
      method: "DELETE",
      headers: {
        "X-Auth-Token": token
      },
      agent
    });
  } catch (error) {
    console.error(`Failed to delete session: ${error.message}`);
  }
}

/**
 * 获取系统电源状态
 */
async function getPowerState(bmcIp, username, password) {
  const auth = await getAuthHeaders(bmcIp, username, password);
  
  try {
    // 自动检测 System ID
    const systemId = await detectSystemId(bmcIp, auth.headers);
    const url = `https://${bmcIp}/redfish/v1/Systems/${systemId}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: auth.headers,
      agent
    });

    if (!response.ok) {
      throw new Error(`Failed to get power state: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      Vendor: auth.vendor,
      SystemId: systemId,
      PowerState: data.PowerState,
      Status: data.Status,
      Model: data.Model,
      Manufacturer: data.Manufacturer,
      SerialNumber: data.SerialNumber,
      BiosVersion: data.BiosVersion
    };
  } finally {
    await auth.cleanup();
  }
}

/**
 * 获取 PCIe 设备信息
 */
async function getPCIeDevices(bmcIp, username, password) {
  const { token, location } = await createSession(bmcIp, username, password);
  
  try {
    const devicesList = [];
    let devicesData = null;
    
    // 尝试多个可能的 PCIe 设备端点
    const possibleEndpoints = [
      '/redfish/v1/Systems/1/PCIeDevices',
      '/redfish/v1/Chassis/1/PCIeDevices',
      '/redfish/v1/Systems/Self/PCIeDevices'
    ];
    
    for (const endpoint of possibleEndpoints) {
      const devicesUrl = `https://${bmcIp}${endpoint}`;
      const devicesResponse = await fetch(devicesUrl, {
        method: "GET",
        headers: {
          "X-Auth-Token": token,
          "Content-Type": "application/json"
        },
        agent
      });

      if (devicesResponse.ok) {
        devicesData = await devicesResponse.json();
        break;
      }
    }

    if (!devicesData) {
      // 如果标准端点都不可用，尝试从 Chassis 获取信息
      const chassisUrl = `https://${bmcIp}/redfish/v1/Chassis/1`;
      const chassisResponse = await fetch(chassisUrl, {
        method: "GET",
        headers: {
          "X-Auth-Token": token,
          "Content-Type": "application/json"
        },
        agent
      });

      if (chassisResponse.ok) {
        const chassisData = await chassisResponse.json();
        
        // 尝试获取 PCIe Slots 信息
        const slotsInfo = [];
        if (chassisData.PCIeSlots && chassisData.PCIeSlots['@odata.id']) {
          const slotsUrl = `https://${bmcIp}${chassisData.PCIeSlots['@odata.id']}`;
          const slotsResponse = await fetch(slotsUrl, {
            method: "GET",
            headers: {
              "X-Auth-Token": token,
              "Content-Type": "application/json"
            },
            agent
          });
          
          if (slotsResponse.ok) {
            const slotsData = await slotsResponse.json();
            if (slotsData.Slots) {
              slotsData.Slots.forEach(slot => {
                slotsInfo.push({
                  SlotNumber: slot.SlotNumber || slot.Location?.PartLocation?.ServiceLabel,
                  SlotType: slot.SlotType,
                  Status: slot.Status,
                  Lanes: slot.Lanes,
                  PCIeType: slot.PCIeType,
                  Oem: slot.Oem
                });
              });
            }
          }
        }
        
        return {
          Message: "Standard PCIe devices endpoint not available. Retrieved chassis and slot information:",
          ChassisInfo: {
            ChassisType: chassisData.ChassisType,
            Manufacturer: chassisData.Manufacturer,
            Model: chassisData.Model,
            SerialNumber: chassisData.SerialNumber,
            PartNumber: chassisData.PartNumber
          },
          PCIeSlots: slotsInfo.length > 0 ? slotsInfo : "No PCIe slot information available"
        };
      }
      
      return {
        Message: "PCIe information not available on this BMC",
        Note: "This BMC may not support PCIe device enumeration via Redfish API"
      };
    }

    // 获取每个设备的详细信息
    if (devicesData.Members && devicesData.Members.length > 0) {
      for (const member of devicesData.Members) {
        const deviceUrl = `https://${bmcIp}${member['@odata.id']}`;
        const deviceResponse = await fetch(deviceUrl, {
          method: "GET",
          headers: {
            "X-Auth-Token": token,
            "Content-Type": "application/json"
          },
          agent
        });

        if (deviceResponse.ok) {
          const deviceInfo = await deviceResponse.json();
          devicesList.push({
            Id: deviceInfo.Id,
            Name: deviceInfo.Name,
            Manufacturer: deviceInfo.Manufacturer,
            Model: deviceInfo.Model,
            PartNumber: deviceInfo.PartNumber,
            SerialNumber: deviceInfo.SerialNumber,
            DeviceType: deviceInfo.DeviceType,
            FirmwareVersion: deviceInfo.FirmwareVersion,
            Status: deviceInfo.Status,
            PCIeInterface: deviceInfo.PCIeInterface
          });
        }
      }
    }

    return {
      DeviceCount: devicesList.length,
      Devices: devicesList
    };
  } finally {
    await deleteSession(bmcIp, token, location);
  }
}

/**
 * 获取启动进度状态
 */
async function getBootProgress(bmcIp, username, password) {
  const auth = await getAuthHeaders(bmcIp, username, password);
  
  try {
    // 自动检测 System ID
    const systemId = await detectSystemId(bmcIp, auth.headers);
    const url = `https://${bmcIp}/redfish/v1/Systems/${systemId}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: auth.headers,
      agent
    });

    if (!response.ok) {
      throw new Error(`Failed to get boot progress: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // 构建返回结果
    const result = {
      Vendor: auth.vendor,
      SystemId: systemId,
      PowerState: data.PowerState,
      Status: data.Status,
      Boot: {
        BootSourceOverrideEnabled: data.Boot?.BootSourceOverrideEnabled,
        BootSourceOverrideTarget: data.Boot?.BootSourceOverrideTarget,
        BootSourceOverrideMode: data.Boot?.BootSourceOverrideMode,
        BootOrder: data.Boot?.BootOrder
      }
    };
    
    // 如果有标准 BootProgress，添加它
    if (data.BootProgress) {
      result.BootProgress = data.BootProgress;
    }
    
    // Dell 特殊处理：添加 OEM 状态信息
    if (auth.vendor === 'Dell' && data.Oem?.Dell?.DellSystem) {
      result.DellSystemStatus = {
        CurrentRollupStatus: data.Oem.Dell.DellSystem.CurrentRollupStatus,
        CPURollupStatus: data.Oem.Dell.DellSystem.CPURollupStatus,
        FanRollupStatus: data.Oem.Dell.DellSystem.FanRollupStatus,
        PSRollupStatus: data.Oem.Dell.DellSystem.PSRollupStatus,
        TempRollupStatus: data.Oem.Dell.DellSystem.TempRollupStatus,
        StorageRollupStatus: data.Oem.Dell.DellSystem.StorageRollupStatus,
        MemoryOperationMode: data.Oem.Dell.DellSystem.MemoryOperationMode,
        LastSystemInventoryTime: data.Oem.Dell.DellSystem.LastSystemInventoryTime,
        Note: "Dell does not support standard BootProgress. Using OEM RollupStatus instead."
      };
    }
    
    // 如果没有 BootProgress 且不是 Dell，添加说明
    if (!data.BootProgress && auth.vendor !== 'Dell') {
      result.Note = "BootProgress not available on this system. Check Boot and Status fields for system state.";
    }
    
    return result;
  } finally {
    await auth.cleanup();
  }
}

/**
 * 获取电源供应状态
 */
async function getPowerSupplyStatus(bmcIp, username, password) {
  const { token, location } = await createSession(bmcIp, username, password);
  
  try {
    // 尝试新版 PowerSubsystem API
    let powerData = null;
    const newApiUrl = `https://${bmcIp}/redfish/v1/Chassis/1/PowerSubsystem`;
    const newApiResp = await fetch(newApiUrl, {
      method: "GET",
      headers: {
        "X-Auth-Token": token,
        "Content-Type": "application/json"
      },
      agent
    });

    if (newApiResp.ok) {
      powerData = await newApiResp.json();
      
      // 获取电源供应详情
      const powerSupplies = [];
      if (powerData.PowerSupplies && powerData.PowerSupplies['@odata.id']) {
        const psuUrl = `https://${bmcIp}${powerData.PowerSupplies['@odata.id']}`;
        const psuResp = await fetch(psuUrl, {
          method: "GET",
          headers: {
            "X-Auth-Token": token,
            "Content-Type": "application/json"
          },
          agent
        });
        
        if (psuResp.ok) {
          const psuData = await psuResp.json();
          if (psuData.Members) {
            for (const member of psuData.Members) {
              const detailUrl = `https://${bmcIp}${member['@odata.id']}`;
              const detailResp = await fetch(detailUrl, {
                method: "GET",
                headers: {
                  "X-Auth-Token": token,
                  "Content-Type": "application/json"
                },
                agent
              });
              
              if (detailResp.ok) {
                powerSupplies.push(await detailResp.json());
              }
            }
          }
        }
      }
      
      return {
        ApiVersion: "PowerSubsystem (New)",
        PowerSupplies: powerSupplies,
        CapacityWatts: powerData.CapacityWatts,
        Status: powerData.Status
      };
    }
    
    // 降级到旧版 Power API
    const oldApiUrl = `https://${bmcIp}/redfish/v1/Chassis/1/Power`;
    const oldApiResp = await fetch(oldApiUrl, {
      method: "GET",
      headers: {
        "X-Auth-Token": token,
        "Content-Type": "application/json"
      },
      agent
    });
    
    if (oldApiResp.ok) {
      const data = await oldApiResp.json();
      return {
        ApiVersion: "Power (Legacy)",
        PowerSupplies: data.PowerSupplies || [],
        PowerControl: data.PowerControl || []
      };
    }
    
    throw new Error("No power supply information available");
  } finally {
    await deleteSession(bmcIp, token, location);
  }
}

/**
 * 获取功耗监控数据
 */
async function getPowerMetrics(bmcIp, username, password) {
  const { token, location } = await createSession(bmcIp, username, password);
  
  try {
    // 尝试 EnvironmentMetrics
    const metricsUrl = `https://${bmcIp}/redfish/v1/Chassis/1/EnvironmentMetrics`;
    const metricsResp = await fetch(metricsUrl, {
      method: "GET",
      headers: {
        "X-Auth-Token": token,
        "Content-Type": "application/json"
      },
      agent
    });
    
    if (metricsResp.ok) {
      const data = await metricsResp.json();
      return {
        ApiVersion: "EnvironmentMetrics",
        PowerWatts: data.PowerWatts,
        EnergykWh: data.EnergykWh,
        TemperatureCelsius: data.TemperatureCelsius,
        HumidityPercent: data.HumidityPercent
      };
    }
    
    // 降级到 PowerSubsystem
    const powerUrl = `https://${bmcIp}/redfish/v1/Chassis/1/PowerSubsystem`;
    const powerResp = await fetch(powerUrl, {
      method: "GET",
      headers: {
        "X-Auth-Token": token,
        "Content-Type": "application/json"
      },
      agent
    });
    
    if (powerResp.ok) {
      const data = await powerResp.json();
      return {
        ApiVersion: "PowerSubsystem",
        CapacityWatts: data.CapacityWatts,
        Status: data.Status
      };
    }
    
    throw new Error("No power metrics available");
  } finally {
    await deleteSession(bmcIp, token, location);
  }
}

/**
 * 获取温度传感器数据
 */
async function getThermalSensors(bmcIp, username, password) {
  const { token, location } = await createSession(bmcIp, username, password);
  
  try {
    // 尝试新版 ThermalSubsystem API
    const newApiUrl = `https://${bmcIp}/redfish/v1/Chassis/1/ThermalSubsystem`;
    const newApiResp = await fetch(newApiUrl, {
      method: "GET",
      headers: {
        "X-Auth-Token": token,
        "Content-Type": "application/json"
      },
      agent
    });
    
    if (newApiResp.ok) {
      const data = await newApiResp.json();
      
      // 获取传感器详情
      const sensors = [];
      if (data.ThermalMetrics && data.ThermalMetrics['@odata.id']) {
        const metricsUrl = `https://${bmcIp}${data.ThermalMetrics['@odata.id']}`;
        const metricsResp = await fetch(metricsUrl, {
          method: "GET",
          headers: {
            "X-Auth-Token": token,
            "Content-Type": "application/json"
          },
          agent
        });
        
        if (metricsResp.ok) {
          const metricsData = await metricsResp.json();
          return {
            ApiVersion: "ThermalSubsystem (New)",
            TemperatureCelsius: metricsData.TemperatureCelsius,
            Status: data.Status
          };
        }
      }
    }
    
    // 降级到旧版 Thermal API
    const oldApiUrl = `https://${bmcIp}/redfish/v1/Chassis/1/Thermal`;
    const oldApiResp = await fetch(oldApiUrl, {
      method: "GET",
      headers: {
        "X-Auth-Token": token,
        "Content-Type": "application/json"
      },
      agent
    });
    
    if (oldApiResp.ok) {
      const data = await oldApiResp.json();
      return {
        ApiVersion: "Thermal (Legacy)",
        Temperatures: data.Temperatures || [],
        Fans: data.Fans || []
      };
    }
    
    throw new Error("No thermal information available");
  } finally {
    await deleteSession(bmcIp, token, location);
  }
}

/**
 * 获取风扇状态
 */
async function getFanStatus(bmcIp, username, password) {
  const { token, location } = await createSession(bmcIp, username, password);
  
  try {
    // 尝试新版 ThermalSubsystem/Fans API
    const newApiUrl = `https://${bmcIp}/redfish/v1/Chassis/1/ThermalSubsystem/Fans`;
    const newApiResp = await fetch(newApiUrl, {
      method: "GET",
      headers: {
        "X-Auth-Token": token,
        "Content-Type": "application/json"
      },
      agent
    });
    
    if (newApiResp.ok) {
      const data = await newApiResp.json();
      const fans = [];
      
      if (data.Members) {
        for (const member of data.Members) {
          const fanUrl = `https://${bmcIp}${member['@odata.id']}`;
          const fanResp = await fetch(fanUrl, {
            method: "GET",
            headers: {
              "X-Auth-Token": token,
              "Content-Type": "application/json"
            },
            agent
          });
          
          if (fanResp.ok) {
            fans.push(await fanResp.json());
          }
        }
      }
      
      return {
        ApiVersion: "ThermalSubsystem/Fans (New)",
        FanCount: fans.length,
        Fans: fans
      };
    }
    
    // 降级到旧版 Thermal API
    const oldApiUrl = `https://${bmcIp}/redfish/v1/Chassis/1/Thermal`;
    const oldApiResp = await fetch(oldApiUrl, {
      method: "GET",
      headers: {
        "X-Auth-Token": token,
        "Content-Type": "application/json"
      },
      agent
    });
    
    if (oldApiResp.ok) {
      const data = await oldApiResp.json();
      return {
        ApiVersion: "Thermal (Legacy)",
        FanCount: data.Fans?.length || 0,
        Fans: data.Fans || []
      };
    }
    
    throw new Error("No fan information available");
  } finally {
    await deleteSession(bmcIp, token, location);
  }
}

/**
 * 获取指定 Slot 的 PCIe 设备信息
 */
async function getPCIeDeviceBySlot(bmcIp, username, password, slotId) {
  const { token, location } = await createSession(bmcIp, username, password);
  
  try {
    // 构建设备 ID（如 "slot_3" 或直接使用用户提供的 ID）
    let deviceId = slotId;
    if (!slotId.startsWith('slot_') && !slotId.startsWith('ob_')) {
      deviceId = `slot_${slotId}`;
    }
    
    // 直接获取指定设备信息
    const deviceUrl = `https://${bmcIp}/redfish/v1/Chassis/1/PCIeDevices/${deviceId}`;
    const deviceResponse = await fetch(deviceUrl, {
      method: "GET",
      headers: {
        "X-Auth-Token": token,
        "Content-Type": "application/json"
      },
      agent
    });

    if (!deviceResponse.ok) {
      // 如果找不到，尝试列出所有设备帮助用户
      const listUrl = `https://${bmcIp}/redfish/v1/Chassis/1/PCIeDevices`;
      const listResp = await fetch(listUrl, {
        method: "GET",
        headers: {
          "X-Auth-Token": token,
          "Content-Type": "application/json"
        },
        agent
      });
      
      if (listResp.ok) {
        const listData = await listResp.json();
        const availableIds = listData.Members.map(m => {
          const parts = m['@odata.id'].split('/');
          return parts[parts.length - 1];
        });
        
        throw new Error(`Device '${deviceId}' not found. Available devices: ${availableIds.join(', ')}`);
      }
      
      throw new Error(`Device '${deviceId}' not found: ${deviceResponse.status} ${deviceResponse.statusText}`);
    }

    const deviceInfo = await deviceResponse.json();
    
    return {
      Id: deviceInfo.Id,
      Name: deviceInfo.Name,
      Manufacturer: deviceInfo.Manufacturer,
      Model: deviceInfo.Model,
      PartNumber: deviceInfo.PartNumber,
      SerialNumber: deviceInfo.SerialNumber,
      DeviceType: deviceInfo.DeviceType,
      FirmwareVersion: deviceInfo.FirmwareVersion,
      Status: deviceInfo.Status,
      PCIeInterface: deviceInfo.PCIeInterface,
      Links: deviceInfo.Links,
      Oem: deviceInfo.Oem
    };
  } finally {
    await deleteSession(bmcIp, token, location);
  }
}

/**
 * 控制系统电源
 */
async function setPowerAction(bmcIp, username, password, resetType) {
  const auth = await getAuthHeaders(bmcIp, username, password);
  
  try {
    // 自动检测 System ID
    const systemId = await detectSystemId(bmcIp, auth.headers);
    const url = `https://${bmcIp}/redfish/v1/Systems/${systemId}/Actions/ComputerSystem.Reset`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: auth.headers,
      body: JSON.stringify({
        ResetType: resetType
      }),
      agent
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Power action failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return {
      success: true,
      vendor: auth.vendor,
      systemId: systemId,
      action: resetType,
      message: `Successfully executed ${resetType} action`
    };
  } finally {
    await auth.cleanup();
  }
}

// 创建 MCP Server
const server = new Server(
  {
    name: "bmc-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 工具列表
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_power_state",
        description: "获取服务器电源状态和系统信息",
        inputSchema: {
          type: "object",
          properties: {
            bmc_ip: {
              type: "string",
              description: "BMC IP 地址（例如：192.168.1.100）"
            },
            username: {
              type: "string",
              description: "BMC 用户名（默认：USERID）",
              default: "USERID"
            },
            password: {
              type: "string",
              description: "BMC 密码"
            }
          },
          required: ["bmc_ip", "password"]
        }
      },
      {
        name: "power_on",
        description: "开启服务器电源",
        inputSchema: {
          type: "object",
          properties: {
            bmc_ip: {
              type: "string",
              description: "BMC IP 地址"
            },
            username: {
              type: "string",
              description: "BMC 用户名（默认：USERID）",
              default: "USERID"
            },
            password: {
              type: "string",
              description: "BMC 密码"
            }
          },
          required: ["bmc_ip", "password"]
        }
      },
      {
        name: "power_off",
        description: "强制关闭服务器电源（ForceOff）",
        inputSchema: {
          type: "object",
          properties: {
            bmc_ip: {
              type: "string",
              description: "BMC IP 地址"
            },
            username: {
              type: "string",
              description: "BMC 用户名（默认：USERID）",
              default: "USERID"
            },
            password: {
              type: "string",
              description: "BMC 密码"
            }
          },
          required: ["bmc_ip", "password"]
        }
      },
      {
        name: "power_cycle",
        description: "重启服务器电源（PowerCycle）",
        inputSchema: {
          type: "object",
          properties: {
            bmc_ip: {
              type: "string",
              description: "BMC IP 地址"
            },
            username: {
              type: "string",
              description: "BMC 用户名（默认：USERID）",
              default: "USERID"
            },
            password: {
              type: "string",
              description: "BMC 密码"
            }
          },
          required: ["bmc_ip", "password"]
        }
      },
      {
        name: "graceful_shutdown",
        description: "优雅关闭服务器（GracefulShutdown）",
        inputSchema: {
          type: "object",
          properties: {
            bmc_ip: {
              type: "string",
              description: "BMC IP 地址"
            },
            username: {
              type: "string",
              description: "BMC 用户名（默认：USERID）",
              default: "USERID"
            },
            password: {
              type: "string",
              description: "BMC 密码"
            }
          },
          required: ["bmc_ip", "password"]
        }
      },
      {
        name: "graceful_restart",
        description: "优雅重启服务器（GracefulRestart）",
        inputSchema: {
          type: "object",
          properties: {
            bmc_ip: {
              type: "string",
              description: "BMC IP 地址"
            },
            username: {
              type: "string",
              description: "BMC 用户名（默认：USERID）",
              default: "USERID"
            },
            password: {
              type: "string",
              description: "BMC 密码"
            }
          },
          required: ["bmc_ip", "password"]
        }
      },
      {
        name: "get_pcie_devices",
        description: "获取服务器所有 PCIe 设备信息",
        inputSchema: {
          type: "object",
          properties: {
            bmc_ip: {
              type: "string",
              description: "BMC IP 地址"
            },
            username: {
              type: "string",
              description: "BMC 用户名（默认：USERID）",
              default: "USERID"
            },
            password: {
              type: "string",
              description: "BMC 密码"
            }
          },
          required: ["bmc_ip", "password"]
        }
      },
      {
        name: "get_pcie_device_by_slot",
        description: "获取指定 Slot 的 PCIe 设备详细信息",
        inputSchema: {
          type: "object",
          properties: {
            bmc_ip: {
              type: "string",
              description: "BMC IP 地址"
            },
            slot_id: {
              type: "string",
              description: "Slot ID，例如：'3' 或 'slot_3' 或 'ob_1'（板载设备）",
              examples: ["3", "5", "13", "slot_3", "ob_1"]
            },
            username: {
              type: "string",
              description: "BMC 用户名（默认：USERID）",
              default: "USERID"
            },
            password: {
              type: "string",
              description: "BMC 密码"
            }
          },
          required: ["bmc_ip", "slot_id", "password"]
        }
      },
      {
        name: "get_boot_progress",
        description: "获取服务器启动进度状态",
        inputSchema: {
          type: "object",
          properties: {
            bmc_ip: {
              type: "string",
              description: "BMC IP 地址"
            },
            username: {
              type: "string",
              description: "BMC 用户名（默认：USERID）",
              default: "USERID"
            },
            password: {
              type: "string",
              description: "BMC 密码"
            }
          },
          required: ["bmc_ip", "password"]
        }
      },
      {
        name: "get_power_supply_status",
        description: "获取电源供应单元（PSU）状态，优先使用 PowerSubsystem 新版 API",
        inputSchema: {
          type: "object",
          properties: {
            bmc_ip: {
              type: "string",
              description: "BMC IP 地址"
            },
            username: {
              type: "string",
              description: "BMC 用户名（默认：USERID）",
              default: "USERID"
            },
            password: {
              type: "string",
              description: "BMC 密码"
            }
          },
          required: ["bmc_ip", "password"]
        }
      },
      {
        name: "get_power_metrics",
        description: "获取功耗监控数据，使用 EnvironmentMetrics API",
        inputSchema: {
          type: "object",
          properties: {
            bmc_ip: {
              type: "string",
              description: "BMC IP 地址"
            },
            username: {
              type: "string",
              description: "BMC 用户名（默认：USERID）",
              default: "USERID"
            },
            password: {
              type: "string",
              description: "BMC 密码"
            }
          },
          required: ["bmc_ip", "password"]
        }
      },
      {
        name: "get_thermal_sensors",
        description: "获取温度传感器数据，优先使用 ThermalSubsystem 新版 API",
        inputSchema: {
          type: "object",
          properties: {
            bmc_ip: {
              type: "string",
              description: "BMC IP 地址"
            },
            username: {
              type: "string",
              description: "BMC 用户名（默认：USERID）",
              default: "USERID"
            },
            password: {
              type: "string",
              description: "BMC 密码"
            }
          },
          required: ["bmc_ip", "password"]
        }
      },
      {
        name: "get_fan_status",
        description: "获取风扇状态和转速，优先使用 ThermalSubsystem/Fans 新版 API",
        inputSchema: {
          type: "object",
          properties: {
            bmc_ip: {
              type: "string",
              description: "BMC IP 地址"
            },
            username: {
              type: "string",
              description: "BMC 用户名（默认：USERID）",
              default: "USERID"
            },
            password: {
              type: "string",
              description: "BMC 密码"
            }
          },
          required: ["bmc_ip", "password"]
        }
      }
    ]
  };
});

// 工具调用处理
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const bmcIp = args.bmc_ip || BMC_IP;
  const username = args.username || BMC_USER || "USERID";
  const password = args.password || BMC_PASSWORD;

  if (!bmcIp) {
    throw new Error("BMC IP address is required");
  }

  if (!password) {
    throw new Error("BMC password is required");
  }

  try {
    switch (name) {
      case "get_power_state": {
        const state = await getPowerState(bmcIp, username, password);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(state, null, 2)
            }
          ]
        };
      }

      case "power_on": {
        const result = await setPowerAction(bmcIp, username, password, "On");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case "power_off": {
        const result = await setPowerAction(bmcIp, username, password, "ForceOff");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case "power_cycle": {
        // 智能 PowerCycle：根据厂商和当前状态执行不同操作
        try {
          // 1. 先获取当前电源状态和厂商信息
          const currentState = await getPowerState(bmcIp, username, password);
          const vendor = currentState.Vendor;
          
          if (currentState.PowerState === "Off") {
            // 如果已关机，直接开机
            const result = await setPowerAction(bmcIp, username, password, "On");
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    vendor: vendor,
                    action: "PowerCycle (was Off, now On)",
                    message: "Server was off, powered on successfully"
                  }, null, 2)
                }
              ]
            };
          } else {
            // 如果开机，Dell 和 Lenovo 使用不同策略
            if (vendor === "Dell") {
              // Dell: 使用 ForceOff + 等待 + On
              await setPowerAction(bmcIp, username, password, "ForceOff");
              await new Promise(resolve => setTimeout(resolve, 5000)); // Dell 需要更长等待时间
              await setPowerAction(bmcIp, username, password, "On");
              
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: true,
                      vendor: "Dell",
                      action: "PowerCycle (ForceOff + On)",
                      message: "Dell server power cycled: ForceOff -> wait 5s -> On"
                    }, null, 2)
                  }
                ]
              };
            } else {
              // Lenovo: 先尝试 ForceRestart
              try {
                await setPowerAction(bmcIp, username, password, "ForceRestart");
                return {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify({
                        success: true,
                        vendor: vendor,
                        action: "PowerCycle (ForceRestart)",
                        message: "Successfully executed ForceRestart"
                      }, null, 2)
                    }
                  ]
                };
              } catch (restartError) {
                // 如果 ForceRestart 不支持，使用 ForceOff + On
                await setPowerAction(bmcIp, username, password, "ForceOff");
                await new Promise(resolve => setTimeout(resolve, 3000));
                await setPowerAction(bmcIp, username, password, "On");
                
                return {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify({
                        success: true,
                        vendor: vendor,
                        action: "PowerCycle (ForceOff + On)",
                        message: "Successfully executed power cycle: ForceOff -> On"
                      }, null, 2)
                    }
                  ]
                };
              }
            }
          }
        } catch (error) {
          throw new Error(`Power cycle failed: ${error.message}`);
        }
      }

      case "graceful_shutdown": {
        const result = await setPowerAction(bmcIp, username, password, "GracefulShutdown");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case "graceful_restart": {
        const result = await setPowerAction(bmcIp, username, password, "GracefulRestart");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case "get_pcie_devices": {
        const devices = await getPCIeDevices(bmcIp, username, password);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(devices, null, 2)
            }
          ]
        };
      }

      case "get_pcie_device_by_slot": {
        const slotId = args.slot_id;
        if (!slotId) {
          throw new Error("slot_id parameter is required");
        }
        const device = await getPCIeDeviceBySlot(bmcIp, username, password, slotId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(device, null, 2)
            }
          ]
        };
      }

      case "get_boot_progress": {
        const progress = await getBootProgress(bmcIp, username, password);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(progress, null, 2)
            }
          ]
        };
      }

      case "get_power_supply_status": {
        const psu = await getPowerSupplyStatus(bmcIp, username, password);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(psu, null, 2)
            }
          ]
        };
      }

      case "get_power_metrics": {
        const metrics = await getPowerMetrics(bmcIp, username, password);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(metrics, null, 2)
            }
          ]
        };
      }

      case "get_thermal_sensors": {
        const thermal = await getThermalSensors(bmcIp, username, password);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(thermal, null, 2)
            }
          ]
        };
      }

      case "get_fan_status": {
        const fans = await getFanStatus(bmcIp, username, password);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(fans, null, 2)
            }
          ]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BMC MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});

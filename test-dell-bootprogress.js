#!/usr/bin/env node

import fetch from "node-fetch";
import https from "https";

// 禁用 SSL 证书验证
const agent = new https.Agent({
  rejectUnauthorized: false
});

// Dell PowerEdge R7515 配置
const DELL_IP = "10.161.176.119";
const DELL_USER = "root";
const DELL_PASSWORD = "calvin";

/**
 * 获取 Basic Auth headers
 */
function getBasicAuthHeaders(username, password) {
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  return {
    "Authorization": `Basic ${auth}`,
    "Content-Type": "application/json"
  };
}

/**
 * 测试多个可能的 BootProgress 端点
 */
async function testBootProgress() {
  console.log("=== 测试 Dell PowerEdge R7515 BootProgress API ===\n");
  
  const headers = getBasicAuthHeaders(DELL_USER, DELL_PASSWORD);
  
  // 1. 首先获取 Systems 列表
  console.log("1. 获取 Systems 列表...");
  const systemsUrl = `https://${DELL_IP}/redfish/v1/Systems`;
  const systemsResp = await fetch(systemsUrl, { headers, agent });
  
  if (systemsResp.ok) {
    const systemsData = await systemsResp.json();
    console.log("✅ Systems 列表:");
    console.log(JSON.stringify(systemsData, null, 2));
    
    if (systemsData.Members && systemsData.Members.length > 0) {
      const systemPath = systemsData.Members[0]['@odata.id'];
      const systemId = systemPath.split('/').pop();
      console.log(`\n系统 ID: ${systemId}\n`);
      
      // 2. 测试完整的 System 信息
      console.log("2. 获取完整 System 信息...");
      const systemUrl = `https://${DELL_IP}${systemPath}`;
      const systemResp = await fetch(systemUrl, { headers, agent });
      
      if (systemResp.ok) {
        const systemData = await systemResp.json();
        console.log("✅ 系统信息:");
        console.log(`  - PowerState: ${systemData.PowerState}`);
        console.log(`  - Model: ${systemData.Model}`);
        console.log(`  - Manufacturer: ${systemData.Manufacturer}`);
        console.log(`  - BiosVersion: ${systemData.BiosVersion}`);
        
        // 检查 BootProgress
        if (systemData.BootProgress) {
          console.log("\n✅ BootProgress 支持:");
          console.log(JSON.stringify(systemData.BootProgress, null, 2));
        } else {
          console.log("\n❌ 没有 BootProgress 字段");
          
          // 列出所有可用字段
          console.log("\n可用的启动相关字段:");
          if (systemData.Boot) {
            console.log("  - Boot:");
            console.log(JSON.stringify(systemData.Boot, null, 2));
          }
          if (systemData.BootOptions) {
            console.log("  - BootOptions:");
            console.log(JSON.stringify(systemData.BootOptions, null, 2));
          }
          if (systemData.ProcessorSummary) {
            console.log("  - ProcessorSummary:");
            console.log(JSON.stringify(systemData.ProcessorSummary, null, 2));
          }
          if (systemData.MemorySummary) {
            console.log("  - MemorySummary:");
            console.log(JSON.stringify(systemData.MemorySummary, null, 2));
          }
        }
        
        // 3. 测试 Dell OEM 扩展
        console.log("\n3. 检查 Dell OEM 扩展...");
        if (systemData.Oem && systemData.Oem.Dell) {
          console.log("✅ Dell OEM 数据:");
          console.log(JSON.stringify(systemData.Oem.Dell, null, 2));
        } else {
          console.log("❌ 没有 Dell OEM 扩展");
        }
        
        // 4. 尝试其他可能的 Dell 特定端点
        console.log("\n4. 测试 Dell 特定端点...");
        
        // 4a. Dell Managers (iDRAC)
        const managersUrl = `https://${DELL_IP}/redfish/v1/Managers`;
        const managersResp = await fetch(managersUrl, { headers, agent });
        if (managersResp.ok) {
          const managersData = await managersResp.json();
          console.log("✅ Managers 可用:");
          console.log(JSON.stringify(managersData, null, 2));
          
          if (managersData.Members && managersData.Members.length > 0) {
            const managerPath = managersData.Members[0]['@odata.id'];
            const managerUrl = `https://${DELL_IP}${managerPath}`;
            const managerResp = await fetch(managerUrl, { headers, agent });
            if (managerResp.ok) {
              const managerData = await managerResp.json();
              console.log("\nManager 详情:");
              console.log(JSON.stringify(managerData, null, 2));
            }
          }
        }
        
        // 4b. Dell TaskService
        const taskUrl = `https://${DELL_IP}/redfish/v1/TaskService`;
        const taskResp = await fetch(taskUrl, { headers, agent });
        if (taskResp.ok) {
          const taskData = await taskResp.json();
          console.log("\n✅ TaskService 可用");
        }
        
      } else {
        console.log(`❌ 获取系统信息失败: ${systemResp.status}`);
      }
    }
  } else {
    console.log(`❌ 获取 Systems 列表失败: ${systemsResp.status}`);
  }
}

// 运行测试
testBootProgress().catch(error => {
  console.error("测试失败:", error);
  process.exit(1);
});

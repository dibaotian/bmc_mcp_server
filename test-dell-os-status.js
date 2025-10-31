#!/usr/bin/env node

/**
 * 探索 Dell iDRAC 判断操作系统运行状态的方法
 * 
 * 目标：找到可以确认 OS 是否已经启动的 API
 */

import fetch from "node-fetch";
import https from "https";

const agent = new https.Agent({
  rejectUnauthorized: false
});

const DELL_IP = "10.161.176.119";
const DELL_USER = "root";
const DELL_PASSWORD = "calvin";

function getBasicAuthHeaders(username, password) {
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  return {
    "Authorization": `Basic ${auth}`,
    "Content-Type": "application/json"
  };
}

async function exploreOSStatus() {
  console.log("=== 探索 Dell PowerEdge R7515 操作系统状态检测方法 ===\n");
  
  const headers = getBasicAuthHeaders(DELL_USER, DELL_PASSWORD);
  
  // 1. 检查系统基本信息
  console.log("1. 检查系统基本信息...");
  const systemUrl = `https://${DELL_IP}/redfish/v1/Systems/System.Embedded.1`;
  const systemResp = await fetch(systemUrl, { headers, agent });
  const systemData = await systemResp.json();
  
  console.log(`   PowerState: ${systemData.PowerState}`);
  console.log(`   Status.State: ${systemData.Status.State}`);
  console.log(`   Status.Health: ${systemData.Status.Health}`);
  
  // 2. 检查 HostInterfaces（OS 和 BMC 通信）
  console.log("\n2. 检查 HostInterfaces（OS 与 BMC 通信接口）...");
  if (systemData.HostInterfaces) {
    const hostIntUrl = `https://${DELL_IP}${systemData.HostInterfaces['@odata.id']}`;
    const hostIntResp = await fetch(hostIntUrl, { headers, agent });
    const hostIntData = await hostIntResp.json();
    
    console.log("   HostInterfaces 信息:");
    console.log(JSON.stringify(hostIntData, null, 2));
    
    // 检查每个接口
    if (hostIntData.Members && hostIntData.Members.length > 0) {
      for (const member of hostIntData.Members) {
        const intUrl = `https://${DELL_IP}${member['@odata.id']}`;
        const intResp = await fetch(intUrl, { headers, agent });
        const intData = await intResp.json();
        console.log("\n   接口详情:");
        console.log(JSON.stringify(intData, null, 2));
      }
    }
  } else {
    console.log("   ❌ 没有 HostInterfaces 信息");
  }
  
  // 3. 检查网络接口
  console.log("\n3. 检查系统网络接口...");
  if (systemData.EthernetInterfaces) {
    const ethUrl = `https://${DELL_IP}${systemData.EthernetInterfaces['@odata.id']}`;
    const ethResp = await fetch(ethUrl, { headers, agent });
    const ethData = await ethResp.json();
    
    console.log(`   网络接口数量: ${ethData.Members.length}`);
    
    // 检查第一个接口的详细状态
    if (ethData.Members.length > 0) {
      const eth0Url = `https://${DELL_IP}${ethData.Members[0]['@odata.id']}`;
      const eth0Resp = await fetch(eth0Url, { headers, agent });
      const eth0Data = await eth0Resp.json();
      
      console.log(`   接口名称: ${eth0Data.Name}`);
      console.log(`   LinkStatus: ${eth0Data.LinkStatus}`);
      console.log(`   Status: ${JSON.stringify(eth0Data.Status)}`);
    }
  }
  
  // 4. 检查 Dell OEM 扩展 - 寻找 OS 相关信息
  console.log("\n4. 检查 Dell OEM 扩展中的 OS 信息...");
  if (systemData.Oem?.Dell?.DellSystem) {
    const dellSys = systemData.Oem.Dell.DellSystem;
    console.log("   可能的 OS 状态指标:");
    console.log(`   - LastSystemInventoryTime: ${dellSys.LastSystemInventoryTime}`);
    console.log(`   - LastUpdateTime: ${dellSys.LastUpdateTime}`);
    console.log(`   - CurrentRollupStatus: ${dellSys.CurrentRollupStatus}`);
    
    // 检查是否有更多 OEM 信息
    if (dellSys['@odata.id']) {
      const dellSysUrl = `https://${DELL_IP}${dellSys['@odata.id']}`;
      const dellSysResp = await fetch(dellSysUrl, { headers, agent });
      const dellSysData = await dellSysResp.json();
      console.log("\n   Dell System 完整信息:");
      console.log(JSON.stringify(dellSysData, null, 2));
    }
  }
  
  // 5. 检查 Managers（iDRAC）是否有 OS 信息
  console.log("\n5. 检查 iDRAC Manager 的 OS 相关信息...");
  const managerUrl = `https://${DELL_IP}/redfish/v1/Managers/iDRAC.Embedded.1`;
  const managerResp = await fetch(managerUrl, { headers, agent });
  const managerData = await managerResp.json();
  
  // 检查是否有 OS 相关链接
  if (managerData.Links?.ManagerForServers) {
    console.log("   ✅ Manager 管理的服务器:");
    managerData.Links.ManagerForServers.forEach(server => {
      console.log(`      ${server['@odata.id']}`);
    });
  }
  
  // 6. 检查 Dell LC (Lifecycle Controller) 服务
  console.log("\n6. 检查 Dell Lifecycle Controller 服务...");
  if (managerData.Links?.Oem?.Dell?.DellLCService) {
    const lcServiceUrl = `https://${DELL_IP}${managerData.Links.Oem.Dell.DellLCService['@odata.id']}`;
    const lcServiceResp = await fetch(lcServiceUrl, { headers, agent });
    const lcServiceData = await lcServiceResp.json();
    
    console.log("   Lifecycle Controller 信息:");
    console.log(JSON.stringify(lcServiceData, null, 2));
  }
  
  // 7. 检查系统属性 - 寻找 OS 名称或版本
  console.log("\n7. 检查系统中是否有 OS 信息...");
  const checkFields = [
    'OperatingSystem',
    'OSName', 
    'OSVersion',
    'HostName',
    'ProcessorSummary',
    'MemorySummary'
  ];
  
  checkFields.forEach(field => {
    if (systemData[field]) {
      console.log(`   ${field}:`);
      console.log(`   ${JSON.stringify(systemData[field], null, 2)}`);
    }
  });
  
  // 8. 总结判断依据
  console.log("\n==========================================");
  console.log("操作系统状态判断依据:");
  console.log("==========================================");
  
  const indicators = {
    powerOn: systemData.PowerState === 'On',
    systemEnabled: systemData.Status.State === 'Enabled',
    healthOK: systemData.Status.Health === 'OK',
    inventoryRecent: true // 需要检查时间戳
  };
  
  console.log(`✅ 电源状态: ${indicators.powerOn ? 'On' : 'Off'}`);
  console.log(`✅ 系统状态: ${indicators.systemEnabled ? 'Enabled' : 'Not Enabled'}`);
  console.log(`✅ 健康状态: ${indicators.healthOK ? 'OK' : 'Not OK'}`);
  
  // Dell 特有的判断
  if (systemData.Oem?.Dell?.DellSystem) {
    const dellSys = systemData.Oem.Dell.DellSystem;
    const lastInventory = new Date(dellSys.LastSystemInventoryTime);
    const now = new Date();
    const minutesAgo = (now - lastInventory) / 1000 / 60;
    
    console.log(`\nDell 特有指标:`);
    console.log(`✅ CurrentRollupStatus: ${dellSys.CurrentRollupStatus}`);
    console.log(`✅ LastSystemInventoryTime: ${dellSys.LastSystemInventoryTime}`);
    console.log(`   (${minutesAgo.toFixed(1)} 分钟前)`);
    
    // 判断逻辑
    const osLikelyRunning = 
      indicators.powerOn &&
      indicators.systemEnabled &&
      indicators.healthOK &&
      dellSys.CurrentRollupStatus === 'OK' &&
      minutesAgo < 60; // 如果最近一小时内有库存更新
    
    console.log("\n==========================================");
    console.log("推断结论:");
    console.log("==========================================");
    if (osLikelyRunning) {
      console.log("✅ 操作系统很可能已经启动并正常运行");
      console.log("   理由:");
      console.log("   1. 服务器电源已开启");
      console.log("   2. 系统状态为 Enabled");
      console.log("   3. 所有健康检查通过");
      console.log("   4. 系统清点信息最近更新过");
    } else {
      console.log("⚠️  无法确定操作系统是否已启动");
      console.log("   建议: 检查以下内容");
      if (!indicators.powerOn) console.log("   - 服务器未开机");
      if (!indicators.systemEnabled) console.log("   - 系统未启用");
      if (!indicators.healthOK) console.log("   - 健康检查未通过");
      if (minutesAgo >= 60) console.log("   - 系统清点信息较旧");
    }
  }
  
  console.log("\n==========================================");
  console.log("结论:");
  console.log("==========================================");
  console.log("❌ Dell iDRAC 没有直接的 API 来确认 OS 是否运行");
  console.log("✅ 可以通过间接指标推断:");
  console.log("   1. PowerState = On");
  console.log("   2. Status.State = Enabled");  
  console.log("   3. CurrentRollupStatus = OK");
  console.log("   4. LastSystemInventoryTime 最近更新");
  console.log("\n💡 建议:");
  console.log("   - 最可靠的方法是通过网络 ping 或 SSH 连接测试");
  console.log("   - 或者使用 iDRAC Virtual Console 查看屏幕");
}

exploreOSStatus().catch(error => {
  console.error("测试失败:", error);
  process.exit(1);
});

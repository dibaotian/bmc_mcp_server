// 获取服务器所有可用信息
import fetch from "node-fetch";
import https from "https";

const agent = new https.Agent({
  rejectUnauthorized: false
});

async function getAllServerInfo(ip, username, password) {
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const headers = {
    "Authorization": `Basic ${auth}`,
    "Content-Type": "application/json"
  };

  console.log(`\n${"=".repeat(60)}`);
  console.log(`服务器: ${ip}`);
  console.log("=".repeat(60));

  try {
    // 1. 获取 Systems 信息
    const systemsUrl = `https://${ip}/redfish/v1/Systems`;
    const systemsResp = await fetch(systemsUrl, { headers, agent });
    
    if (systemsResp.ok) {
      const systemsData = await systemsResp.json();
      const systemId = systemsData.Members[0]['@odata.id'].split('/').pop();
      
      const systemUrl = `https://${ip}/redfish/v1/Systems/${systemId}`;
      const systemResp = await fetch(systemUrl, { headers, agent });
      
      if (systemResp.ok) {
        const data = await systemResp.json();
        
        console.log("\n【基本信息】");
        console.log(`  型号: ${data.Model}`);
        console.log(`  制造商: ${data.Manufacturer}`);
        console.log(`  序列号: ${data.SerialNumber}`);
        console.log(`  SKU: ${data.SKU}`);
        console.log(`  Part Number: ${data.PartNumber}`);
        console.log(`  Asset Tag: ${data.AssetTag}`);
        console.log(`  UUID: ${data.UUID}`);
        console.log(`  主机名: ${data.HostName}`);
        
        console.log("\n【电源和状态】");
        console.log(`  电源状态: ${data.PowerState}`);
        console.log(`  整体状态: ${JSON.stringify(data.Status)}`);
        console.log(`  LED 指示灯: ${data.IndicatorLED}`);
        
        console.log("\n【BIOS/固件】");
        console.log(`  BIOS 版本: ${data.BiosVersion}`);
        console.log(`  系统类型: ${data.SystemType}`);
        
        console.log("\n【处理器摘要】");
        if (data.ProcessorSummary) {
          console.log(`  CPU 数量: ${data.ProcessorSummary.Count}`);
          console.log(`  CPU 型号: ${data.ProcessorSummary.Model}`);
          console.log(`  逻辑处理器: ${data.ProcessorSummary.LogicalProcessorCount}`);
          console.log(`  CPU 状态: ${JSON.stringify(data.ProcessorSummary.Status)}`);
        }
        
        console.log("\n【内存摘要】");
        if (data.MemorySummary) {
          console.log(`  总内存 (GiB): ${data.MemorySummary.TotalSystemMemoryGiB}`);
          console.log(`  内存状态: ${JSON.stringify(data.MemorySummary.Status)}`);
        }
        
        console.log("\n【启动信息】");
        if (data.BootProgress) {
          console.log(`  启动进度: ${data.BootProgress.LastState}`);
        }
        if (data.Boot) {
          console.log(`  启动模式: ${data.Boot.BootSourceOverrideMode}`);
        }
      }
    }
    
    // 2. 获取 Managers (iDRAC/XCC) 信息
    const managersUrl = `https://${ip}/redfish/v1/Managers`;
    const managersResp = await fetch(managersUrl, { headers, agent });
    
    if (managersResp.ok) {
      const managersData = await managersResp.json();
      if (managersData.Members && managersData.Members.length > 0) {
        const managerUrl = `https://${ip}${managersData.Members[0]['@odata.id']}`;
        const managerResp = await fetch(managerUrl, { headers, agent });
        
        if (managerResp.ok) {
          const data = await managerResp.json();
          
          console.log("\n【BMC/iDRAC 信息】");
          console.log(`  BMC 型号: ${data.Model}`);
          console.log(`  BMC 固件版本: ${data.FirmwareVersion}`);
          console.log(`  BMC 状态: ${JSON.stringify(data.Status)}`);
        }
      }
    }
    
    // 3. 获取 Chassis 信息
    const chassisUrl = `https://${ip}/redfish/v1/Chassis`;
    const chassisResp = await fetch(chassisUrl, { headers, agent });
    
    if (chassisResp.ok) {
      const chassisData = await chassisResp.json();
      if (chassisData.Members && chassisData.Members.length > 0) {
        const chassis1Url = `https://${ip}${chassisData.Members[0]['@odata.id']}`;
        const chassis1Resp = await fetch(chassis1Url, { headers, agent });
        
        if (chassis1Resp.ok) {
          const data = await chassis1Resp.json();
          
          console.log("\n【机箱信息】");
          console.log(`  机箱类型: ${data.ChassisType}`);
          console.log(`  机箱型号: ${data.Model}`);
          console.log(`  Part Number: ${data.PartNumber}`);
          if (data.PowerState) {
            console.log(`  机箱电源: ${data.PowerState}`);
          }
          if (data.Location) {
            console.log(`  位置: ${JSON.stringify(data.Location)}`);
          }
        }
      }
    }

  } catch (error) {
    console.error(`错误: ${error.message}`);
  }
}

async function main() {
  const servers = [
    { ip: "10.161.176.31", user: "USERID", pass: "Xilinx1234", name: "SR655_V3_1 (Lenovo)" },
    { ip: "10.161.176.64", user: "root", pass: "calvin", name: "R740 (Dell)" },
    { ip: "10.161.176.119", user: "root", pass: "calvin", name: "R7515 (Dell)" }
  ];

  for (const server of servers) {
    await getAllServerInfo(server.ip, server.user, server.pass);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log("\n" + "=".repeat(60));
  console.log("建议添加到表格的字段：");
  console.log("=".repeat(60));
  console.log("1. BIOS 版本 - 用于固件管理");
  console.log("2. CPU 型号和数量 - 硬件规格");
  console.log("3. 内存容量 (GiB) - 硬件规格");
  console.log("4. iDRAC/BMC 固件版本 - BMC 管理");
  console.log("5. 主机名 - 网络识别");
  console.log("6. Asset Tag - 资产管理");
  console.log("7. 当前电源状态 - 快速参考");
  console.log("8. SKU - 采购和库存");
  console.log("=".repeat(60) + "\n");
}

main().catch(console.error);

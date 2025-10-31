// 测试服务器 10.161.176.119
import fetch from "node-fetch";
import https from "https";

const agent = new https.Agent({
  rejectUnauthorized: false
});

const SERVER_IP = "10.161.176.119";
const USERNAME = "root";
const PASSWORD = "calvin";

async function testServer119() {
  console.log("========================================");
  console.log(`测试服务器 ${SERVER_IP}`);
  console.log("========================================\n");

  // 1. 测试基本连接
  console.log("1️⃣  测试 Redfish 基本连接");
  try {
    const rootUrl = `https://${SERVER_IP}/redfish/v1`;
    const rootResp = await fetch(rootUrl, { agent });
    console.log(`   /redfish/v1: ${rootResp.status} ${rootResp.statusText}`);
    
    if (rootResp.ok) {
      const data = await rootResp.json();
      console.log(`   ✅ Redfish 版本: ${data.RedfishVersion}`);
      console.log(`   ✅ UUID: ${data.UUID}`);
      console.log(`   ✅ Name: ${data.Name}`);
      
      // 检查 OEM 信息识别厂商
      if (data.Oem) {
        const vendors = Object.keys(data.Oem);
        console.log(`   ✅ 厂商: ${vendors.join(', ')}`);
      }
    } else {
      console.log(`   ❌ Redfish 不可用`);
      return;
    }
  } catch (error) {
    console.log(`   ❌ 连接失败: ${error.message}`);
    return;
  }
  console.log("");

  // 2. 测试 Basic Auth
  console.log("2️⃣  测试 Basic Auth");
  const auth = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
  const headers = {
    "Authorization": `Basic ${auth}`,
    "Content-Type": "application/json"
  };

  try {
    const systemsUrl = `https://${SERVER_IP}/redfish/v1/Systems`;
    const systemsResp = await fetch(systemsUrl, { headers, agent });
    console.log(`   Systems 列表: ${systemsResp.status} ${systemsResp.statusText}`);
    
    if (systemsResp.ok) {
      const data = await systemsResp.json();
      console.log(`   ✅ Systems 数量: ${data.Members?.length || 0}`);
      
      if (data.Members && data.Members.length > 0) {
        for (const member of data.Members) {
          const systemId = member['@odata.id'].split('/').pop();
          console.log(`\n   测试 System: ${systemId}`);
          
          const systemUrl = `https://${SERVER_IP}${member['@odata.id']}`;
          const systemResp = await fetch(systemUrl, { headers, agent });
          
          if (systemResp.ok) {
            const systemData = await systemResp.json();
            console.log(`   ✅ 型号: ${systemData.Model}`);
            console.log(`   ✅ 制造商: ${systemData.Manufacturer}`);
            console.log(`   ✅ 电源状态: ${systemData.PowerState}`);
            console.log(`   ✅ 序列号: ${systemData.SerialNumber}`);
            console.log(`   ✅ BIOS: ${systemData.BiosVersion}`);
          }
        }
      }
    }
  } catch (error) {
    console.log(`   ❌ Basic Auth 失败: ${error.message}`);
  }
  console.log("");

  // 3. 测试 Session Auth（备用）
  console.log("3️⃣  测试 Session Auth（备用）");
  try {
    const sessionUrl = `https://${SERVER_IP}/redfish/v1/SessionService/Sessions`;
    const sessionResp = await fetch(sessionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        UserName: USERNAME,
        Password: PASSWORD
      }),
      agent
    });

    console.log(`   Session 创建: ${sessionResp.status} ${sessionResp.statusText}`);
    
    if (sessionResp.ok) {
      console.log(`   ✅ Session Auth 也支持`);
      const token = sessionResp.headers.get("X-Auth-Token");
      const location = sessionResp.headers.get("Location");
      
      // 清理
      if (location) {
        await fetch(`https://${SERVER_IP}${location}`, {
          method: "DELETE",
          headers: { "X-Auth-Token": token },
          agent
        });
      }
    }
  } catch (error) {
    console.log(`   ⚠️  Session Auth 不支持（这是正常的）`);
  }

  console.log("\n========================================");
  console.log("总结");
  console.log("========================================");
  console.log(`服务器 ${SERVER_IP} 兼容性检查完成`);
  console.log("========================================\n");
}

testServer119().catch(console.error);

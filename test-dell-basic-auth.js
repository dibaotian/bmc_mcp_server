// 测试 Dell iDRAC 使用 Basic Auth
import fetch from "node-fetch";
import https from "https";

const agent = new https.Agent({
  rejectUnauthorized: false
});

const DELL_IP = "10.161.176.64";
const USERNAME = "root";
const PASSWORD = "calvin";

async function testBasicAuth() {
  console.log("========================================");
  console.log("Dell iDRAC Basic Auth 测试");
  console.log("========================================\n");

  // 创建 Basic Auth 头
  const auth = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
  const headers = {
    "Authorization": `Basic ${auth}`,
    "Content-Type": "application/json"
  };

  // 1. 测试获取 Systems 信息（使用 Basic Auth）
  console.log("1️⃣  测试 Systems/1 (Basic Auth)");
  try {
    const systemUrl = `https://${DELL_IP}/redfish/v1/Systems/System.Embedded.1`;
    const systemResp = await fetch(systemUrl, { headers, agent });
    console.log(`   System.Embedded.1: ${systemResp.status} ${systemResp.statusText}`);
    
    if (systemResp.ok) {
      const data = await systemResp.json();
      console.log(`   ✅ Model: ${data.Model}`);
      console.log(`   ✅ Manufacturer: ${data.Manufacturer}`);
      console.log(`   ✅ PowerState: ${data.PowerState}`);
      console.log(`   ✅ SerialNumber: ${data.SerialNumber}`);
      console.log(`   ✅ BiosVersion: ${data.BiosVersion}\n`);
      return true;
    }
  } catch (error) {
    console.log(`   ❌ 失败: ${error.message}`);
  }

  // 2. 尝试 Systems/1
  console.log("2️⃣  测试 Systems/1 (Basic Auth)");
  try {
    const systemUrl = `https://${DELL_IP}/redfish/v1/Systems/1`;
    const systemResp = await fetch(systemUrl, { headers, agent });
    console.log(`   Systems/1: ${systemResp.status} ${systemResp.statusText}`);
    
    if (systemResp.ok) {
      const data = await systemResp.json();
      console.log(`   ✅ Model: ${data.Model}`);
      console.log(`   ✅ PowerState: ${data.PowerState}\n`);
      return true;
    }
  } catch (error) {
    console.log(`   ❌ 失败: ${error.message}`);
  }

  // 3. 列出所有 Systems
  console.log("3️⃣  列出所有 Systems");
  try {
    const systemsUrl = `https://${DELL_IP}/redfish/v1/Systems`;
    const systemsResp = await fetch(systemsUrl, { headers, agent });
    console.log(`   Systems 列表: ${systemsResp.status} ${systemsResp.statusText}`);
    
    if (systemsResp.ok) {
      const data = await systemsResp.json();
      console.log(`   ✅ 找到 ${data.Members?.length || 0} 个系统`);
      
      if (data.Members) {
        for (const member of data.Members) {
          const systemId = member['@odata.id'];
          console.log(`\n   测试: ${systemId}`);
          
          const detailResp = await fetch(`https://${DELL_IP}${systemId}`, { headers, agent });
          console.log(`   状态: ${detailResp.status} ${detailResp.statusText}`);
          
          if (detailResp.ok) {
            const detail = await detailResp.json();
            console.log(`   ✅ 型号: ${detail.Model}`);
            console.log(`   ✅ 电源: ${detail.PowerState}`);
          }
        }
      }
    }
  } catch (error) {
    console.log(`   ❌ 失败: ${error.message}`);
  }

  console.log("\n========================================");
  console.log("结论");
  console.log("========================================");
  console.log("Dell iDRAC 可能需要：");
  console.log("1. Basic Authentication 而非 Session 认证");
  console.log("2. 或者用户凭据不正确");
  console.log("3. 建议检查 iDRAC Web 界面确认用户名和密码");
  console.log("========================================\n");
}

testBasicAuth().catch(console.error);

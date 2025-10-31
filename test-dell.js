// 测试 Dell iDRAC 连接
import fetch from "node-fetch";
import https from "https";

const agent = new https.Agent({
  rejectUnauthorized: false
});

const DELL_IP = "10.161.176.64";
const USERNAME = "root";
const PASSWORD = "calvin";

async function testDell() {
  console.log("========================================");
  console.log("Dell iDRAC 连接测试");
  console.log("========================================\n");

  // 1. 测试基本连接
  console.log("1️⃣  测试基本连接");
  try {
    const rootUrl = `https://${DELL_IP}/redfish/v1`;
    const rootResp = await fetch(rootUrl, { agent });
    console.log(`   /redfish/v1: ${rootResp.status} ${rootResp.statusText}`);
    
    if (rootResp.ok) {
      const data = await rootResp.json();
      console.log(`   ✅ RedfishVersion: ${data.RedfishVersion}`);
      console.log(`   ✅ Systems: ${data.Systems?.['@odata.id']}`);
      console.log(`   ✅ Chassis: ${data.Chassis?.['@odata.id']}`);
    }
  } catch (error) {
    console.log(`   ❌ 连接失败: ${error.message}`);
    return;
  }
  console.log("");

  // 2. 测试 Session 创建（不同的用户名）
  console.log("2️⃣  测试 Session 创建");
  
  const testUsers = [
    { username: "root", password: PASSWORD },
    { username: "admin", password: PASSWORD },
    { username: "Administrator", password: PASSWORD }
  ];

  for (const user of testUsers) {
    try {
      const sessionUrl = `https://${DELL_IP}/redfish/v1/SessionService/Sessions`;
      const sessionResp = await fetch(sessionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          UserName: user.username,
          Password: user.password
        }),
        agent
      });

      console.log(`   ${user.username}: ${sessionResp.status} ${sessionResp.statusText}`);
      
      if (sessionResp.ok) {
        const token = sessionResp.headers.get("X-Auth-Token");
        const location = sessionResp.headers.get("Location");
        console.log(`   ✅ 成功！Token: ${token?.substring(0, 20)}...`);
        console.log(`   ✅ Session: ${location}`);
        
        // 清理 Session
        if (location) {
          await fetch(`https://${DELL_IP}${location}`, {
            method: "DELETE",
            headers: { "X-Auth-Token": token },
            agent
          });
        }
        break;
      }
    } catch (error) {
      console.log(`   ❌ ${user.username} 失败: ${error.message}`);
    }
  }
  console.log("");

  // 3. 测试获取 Systems 列表
  console.log("3️⃣  测试 Systems 端点");
  try {
    const systemsUrl = `https://${DELL_IP}/redfish/v1/Systems`;
    const systemsResp = await fetch(systemsUrl, { agent });
    console.log(`   /redfish/v1/Systems: ${systemsResp.status} ${systemsResp.statusText}`);
    
    if (systemsResp.ok) {
      const data = await systemsResp.json();
      console.log(`   ✅ Systems 数量: ${data.Members?.length || 0}`);
      if (data.Members && data.Members.length > 0) {
        data.Members.forEach((member, index) => {
          console.log(`   ✅ System ${index + 1}: ${member['@odata.id']}`);
        });
      }
    }
  } catch (error) {
    console.log(`   ❌ 失败: ${error.message}`);
  }
  console.log("");

  console.log("========================================");
  console.log("诊断建议");
  console.log("========================================");
  console.log("1. 检查用户名是否正确（root/admin/Administrator）");
  console.log("2. 检查密码是否正确");
  console.log("3. 检查 iDRAC 是否启用了 Redfish");
  console.log("4. 检查防火墙是否阻止连接");
  console.log("5. 尝试访问 iDRAC Web界面确认凭据");
  console.log("========================================\n");
}

testDell().catch(console.error);

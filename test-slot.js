// 测试查询指定 Slot 的设备信息
import fetch from "node-fetch";
import https from "https";

const agent = new https.Agent({
  rejectUnauthorized: false
});

const BMC_IP = "10.161.176.31";
const USERNAME = "USERID";
const PASSWORD = "Xilinx1234";

async function createSession(bmcIp, username, password) {
  const url = `https://${bmcIp}/redfish/v1/SessionService/Sessions`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ UserName: username, Password: password }),
    agent
  });
  
  const token = response.headers.get("X-Auth-Token");
  const location = response.headers.get("Location");
  return { token, location };
}

async function deleteSession(bmcIp, token, location) {
  if (!location) return;
  await fetch(`https://${bmcIp}${location}`, {
    method: "DELETE",
    headers: { "X-Auth-Token": token },
    agent
  });
}

async function testSlotQuery(slotId) {
  const { token, location } = await createSession(BMC_IP, USERNAME, PASSWORD);
  
  try {
    console.log(`\n=== 查询 Slot ${slotId} ===`);
    
    // 构建设备 ID
    let deviceId = slotId;
    if (!slotId.startsWith('slot_') && !slotId.startsWith('ob_')) {
      deviceId = `slot_${slotId}`;
    }
    
    const deviceUrl = `https://${BMC_IP}/redfish/v1/Chassis/1/PCIeDevices/${deviceId}`;
    const response = await fetch(deviceUrl, {
      method: "GET",
      headers: {
        "X-Auth-Token": token,
        "Content-Type": "application/json"
      },
      agent
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ 找到设备: ${deviceId}`);
      console.log(`   名称: ${data.Name}`);
      console.log(`   制造商: ${data.Manufacturer}`);
      console.log(`   型号: ${data.Model}`);
      console.log(`   接口: ${JSON.stringify(data.PCIeInterface)}`);
      console.log(`   状态: ${JSON.stringify(data.Status)}`);
    } else {
      console.log(`❌ 设备 ${deviceId} 不存在: ${response.status}`);
    }
  } finally {
    await deleteSession(BMC_IP, token, location);
  }
}

async function main() {
  console.log("测试指定 Slot 设备查询功能");
  console.log("================================");
  
  // 测试不同的 slot ID 格式
  const testCases = [
    "3",        // 数字格式
    "5",        // 数字格式
    "13",       // 数字格式
    "slot_3",   // 完整格式
    "ob_1",     // 板载设备
    "99"        // 不存在的设备
  ];
  
  for (const slotId of testCases) {
    await testSlotQuery(slotId);
    await new Promise(resolve => setTimeout(resolve, 500)); // 避免请求过快
  }
  
  console.log("\n================================");
  console.log("测试完成！");
}

main().catch(console.error);

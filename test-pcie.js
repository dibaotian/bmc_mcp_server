// 测试 PCIe 设备查询功能
import fetch from "node-fetch";
import https from "https";

const agent = new https.Agent({
  rejectUnauthorized: false
});

const BMC_IP = "10.161.176.31";
const USERNAME = "USERID";
const PASSWORD = "Xilinx1234";

async function testPCIeEndpoints() {
  // 创建 Session
  console.log("Creating session...");
  const sessionUrl = `https://${BMC_IP}/redfish/v1/SessionService/Sessions`;
  const sessionResp = await fetch(sessionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ UserName: USERNAME, Password: PASSWORD }),
    agent
  });
  
  const token = sessionResp.headers.get("X-Auth-Token");
  const location = sessionResp.headers.get("Location");
  console.log("Session created:", location);

  // 测试不同的端点
  const endpoints = [
    '/redfish/v1/Systems/1',
    '/redfish/v1/Chassis/1',
    '/redfish/v1/Systems/1/PCIeDevices',
    '/redfish/v1/Chassis/1/PCIeDevices',
  ];

  console.log("\nTesting endpoints:");
  for (const endpoint of endpoints) {
    const url = `https://${BMC_IP}${endpoint}`;
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "X-Auth-Token": token,
        "Content-Type": "application/json"
      },
      agent
    });
    
    console.log(`\n${endpoint}: ${resp.status} ${resp.statusText}`);
    if (resp.ok) {
      const data = await resp.json();
      console.log("Keys:", Object.keys(data));
      if (data.PCIeSlots) {
        console.log("  - Has PCIeSlots:", data.PCIeSlots);
      }
      if (data.Members) {
        console.log("  - Members count:", data.Members.length);
      }
    }
  }

  // 清理 Session
  await fetch(`https://${BMC_IP}${location}`, {
    method: "DELETE",
    headers: { "X-Auth-Token": token },
    agent
  });
  console.log("\nSession closed");
}

testPCIeEndpoints().catch(console.error);

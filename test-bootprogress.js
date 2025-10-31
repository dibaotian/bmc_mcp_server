// 测试 BootProgress 状态
import fetch from "node-fetch";
import https from "https";

const agent = new https.Agent({
  rejectUnauthorized: false
});

const BMC_IP = "10.161.176.31";
const USERNAME = "USERID";
const PASSWORD = "Xilinx1234";

async function testBootProgress() {
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

  try {
    // 获取系统信息
    const systemUrl = `https://${BMC_IP}/redfish/v1/Systems/1`;
    const systemResp = await fetch(systemUrl, {
      method: "GET",
      headers: {
        "X-Auth-Token": token,
        "Content-Type": "application/json"
      },
      agent
    });

    if (systemResp.ok) {
      const systemData = await systemResp.json();
      
      console.log("\n=== Boot Progress Information ===");
      console.log("BootProgress:", JSON.stringify(systemData.BootProgress, null, 2));
      
      console.log("\n=== Power State ===");
      console.log("PowerState:", systemData.PowerState);
      
      console.log("\n=== Boot Configuration ===");
      console.log("Boot:", JSON.stringify(systemData.Boot, null, 2));
      
      console.log("\n=== Status ===");
      console.log("Status:", JSON.stringify(systemData.Status, null, 2));
    }

  } finally {
    // 清理 Session
    await fetch(`https://${BMC_IP}${location}`, {
      method: "DELETE",
      headers: { "X-Auth-Token": token },
      agent
    });
    console.log("\nSession closed");
  }
}

testBootProgress().catch(console.error);

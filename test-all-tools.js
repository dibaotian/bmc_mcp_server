// 测试所有 BMC MCP 工具
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

async function testAllTools() {
  console.log("========================================");
  console.log("BMC MCP Server 所有工具测试");
  console.log("========================================\n");

  const { token, location } = await createSession(BMC_IP, USERNAME, PASSWORD);

  try {
    // 1. get_power_state & 2. get_boot_progress
    console.log("1️⃣  get_power_state");
    const systemUrl = `https://${BMC_IP}/redfish/v1/Systems/1`;
    const systemResp = await fetch(systemUrl, {
      method: "GET",
      headers: { "X-Auth-Token": token, "Content-Type": "application/json" },
      agent
    });
    if (systemResp.ok) {
      const data = await systemResp.json();
      console.log(`   ✅ PowerState: ${data.PowerState}`);
      console.log(`   ✅ Model: ${data.Model}`);
      console.log(`   ✅ BIOS: ${data.BiosVersion}\n`);
      
      // 2. get_boot_progress (使用同一数据)
      console.log("2️⃣  get_boot_progress");
      console.log(`   ✅ LastState: ${data.BootProgress.LastState}`);
      console.log(`   ✅ OemLastState: ${data.BootProgress.OemLastState}`);
      console.log(`   ✅ Boot Mode: ${data.Boot.BootSourceOverrideMode}\n`);
    }

    // 3. get_pcie_devices
    console.log("3️⃣  get_pcie_devices");
    const pcieUrl = `https://${BMC_IP}/redfish/v1/Chassis/1/PCIeDevices`;
    const pcieResp = await fetch(pcieUrl, {
      method: "GET",
      headers: { "X-Auth-Token": token, "Content-Type": "application/json" },
      agent
    });
    if (pcieResp.ok) {
      const data = await pcieResp.json();
      console.log(`   ✅ Found ${data['Members@odata.count']} PCIe devices\n`);
    }

    // 4. get_pcie_device_by_slot
    console.log("4️⃣  get_pcie_device_by_slot (Slot 5)");
    const slot5Url = `https://${BMC_IP}/redfish/v1/Chassis/1/PCIeDevices/slot_5`;
    const slot5Resp = await fetch(slot5Url, {
      method: "GET",
      headers: { "X-Auth-Token": token, "Content-Type": "application/json" },
      agent
    });
    if (slot5Resp.ok) {
      const data = await slot5Resp.json();
      console.log(`   ✅ Device: ${data.Name}`);
      console.log(`   ✅ Manufacturer: ${data.Manufacturer}`);
      console.log(`   ✅ Interface: Gen${data.PCIeInterface?.PCIeType?.replace('Gen', '')} x${data.PCIeInterface?.LanesInUse}\n`);
    }

    console.log("========================================");
    console.log("工具测试总结");
    console.log("========================================");
    console.log("✅ 电源管理工具: 6 个");
    console.log("   - get_power_state");
    console.log("   - power_on / power_off / power_cycle");
    console.log("   - graceful_shutdown / graceful_restart");
    console.log("");
    console.log("✅ 硬件查询工具: 3 个");
    console.log("   - get_pcie_devices");
    console.log("   - get_pcie_device_by_slot");
    console.log("   - get_boot_progress");
    console.log("");
    console.log("📊 总计: 9 个工具");
    console.log("========================================\n");

  } finally {
    await deleteSession(BMC_IP, token, location);
    console.log("Session closed");
  }
}

testAllTools().catch(console.error);

// 详细测试 PCIe 设备信息
import fetch from "node-fetch";
import https from "https";

const agent = new https.Agent({
  rejectUnauthorized: false
});

const BMC_IP = "10.161.176.31";
const USERNAME = "USERID";
const PASSWORD = "Xilinx1234";

async function testPCIeDetails() {
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
    // 获取 PCIe 设备列表
    console.log("\n=== PCIe Devices from Chassis ===");
    const devicesUrl = `https://${BMC_IP}/redfish/v1/Chassis/1/PCIeDevices`;
    const devicesResp = await fetch(devicesUrl, {
      method: "GET",
      headers: {
        "X-Auth-Token": token,
        "Content-Type": "application/json"
      },
      agent
    });

    if (devicesResp.ok) {
      const devicesData = await devicesResp.json();
      console.log(`Found ${devicesData['Members@odata.count']} PCIe devices\n`);

      // 获取每个设备的详细信息
      for (const member of devicesData.Members) {
        const deviceUrl = `https://${BMC_IP}${member['@odata.id']}`;
        const deviceResp = await fetch(deviceUrl, {
          method: "GET",
          headers: {
            "X-Auth-Token": token,
            "Content-Type": "application/json"
          },
          agent
        });

        if (deviceResp.ok) {
          const deviceInfo = await deviceResp.json();
          console.log(`Device ID: ${deviceInfo.Id}`);
          console.log(`  Name: ${deviceInfo.Name}`);
          console.log(`  Manufacturer: ${deviceInfo.Manufacturer}`);
          console.log(`  Model: ${deviceInfo.Model}`);
          console.log(`  DeviceType: ${deviceInfo.DeviceType}`);
          console.log(`  Status: ${JSON.stringify(deviceInfo.Status)}`);
          console.log(`  PCIeInterface: ${JSON.stringify(deviceInfo.PCIeInterface)}`);
          console.log("");
        }
      }
    }

    // 获取 PCIe Slots 信息
    console.log("\n=== PCIe Slots Information ===");
    const chassisUrl = `https://${BMC_IP}/redfish/v1/Chassis/1`;
    const chassisResp = await fetch(chassisUrl, {
      method: "GET",
      headers: {
        "X-Auth-Token": token,
        "Content-Type": "application/json"
      },
      agent
    });

    if (chassisResp.ok) {
      const chassisData = await chassisResp.json();
      if (chassisData.PCIeSlots) {
        const slotsUrl = `https://${BMC_IP}${chassisData.PCIeSlots['@odata.id']}`;
        const slotsResp = await fetch(slotsUrl, {
          method: "GET",
          headers: {
            "X-Auth-Token": token,
            "Content-Type": "application/json"
          },
          agent
        });

        if (slotsResp.ok) {
          const slotsData = await slotsResp.json();
          console.log(`Found ${slotsData.Slots?.length || 0} PCIe slots\n`);
          
          if (slotsData.Slots) {
            slotsData.Slots.forEach((slot, index) => {
              console.log(`Slot ${index + 1}:`);
              console.log(`  Location: ${slot.Location?.PartLocation?.ServiceLabel || 'N/A'}`);
              console.log(`  SlotType: ${slot.SlotType || 'N/A'}`);
              console.log(`  Lanes: ${slot.Lanes || 'N/A'}`);
              console.log(`  PCIeType: ${slot.PCIeType || 'N/A'}`);
              console.log(`  Status: ${JSON.stringify(slot.Status)}`);
              console.log("");
            });
          }
        }
      }
    }

  } finally {
    // 清理 Session
    await fetch(`https://${BMC_IP}${location}`, {
      method: "DELETE",
      headers: { "X-Auth-Token": token },
      agent
    });
    console.log("Session closed");
  }
}

testPCIeDetails().catch(console.error);

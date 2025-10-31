// 测试新添加的监控工具
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

async function testMonitoringTools() {
  console.log("========================================");
  console.log("测试新添加的监控工具");
  console.log("========================================\n");

  const { token, location } = await createSession(BMC_IP, USERNAME, PASSWORD);

  try {
    // 1. 测试 PowerSubsystem
    console.log("1️⃣  测试 PowerSubsystem API");
    const powerSubUrl = `https://${BMC_IP}/redfish/v1/Chassis/1/PowerSubsystem`;
    const powerSubResp = await fetch(powerSubUrl, {
      method: "GET",
      headers: { "X-Auth-Token": token, "Content-Type": "application/json" },
      agent
    });
    console.log(`   PowerSubsystem: ${powerSubResp.status} ${powerSubResp.statusText}`);
    if (powerSubResp.ok) {
      const data = await powerSubResp.json();
      console.log(`   ✅ CapacityWatts: ${data.CapacityWatts}`);
      console.log(`   ✅ Status: ${JSON.stringify(data.Status)}`);
      if (data.PowerSupplies) {
        console.log(`   ✅ PowerSupplies Link: ${data.PowerSupplies['@odata.id']}`);
      }
    }
    console.log("");

    // 2. 测试 EnvironmentMetrics
    console.log("2️⃣  测试 EnvironmentMetrics API");
    const envUrl = `https://${BMC_IP}/redfish/v1/Chassis/1/EnvironmentMetrics`;
    const envResp = await fetch(envUrl, {
      method: "GET",
      headers: { "X-Auth-Token": token, "Content-Type": "application/json" },
      agent
    });
    console.log(`   EnvironmentMetrics: ${envResp.status} ${envResp.statusText}`);
    if (envResp.ok) {
      const data = await envResp.json();
      console.log(`   ✅ PowerWatts: ${JSON.stringify(data.PowerWatts)}`);
      console.log(`   ✅ TemperatureCelsius: ${JSON.stringify(data.TemperatureCelsius)}`);
    }
    console.log("");

    // 3. 测试 ThermalSubsystem
    console.log("3️⃣  测试 ThermalSubsystem API");
    const thermalSubUrl = `https://${BMC_IP}/redfish/v1/Chassis/1/ThermalSubsystem`;
    const thermalSubResp = await fetch(thermalSubUrl, {
      method: "GET",
      headers: { "X-Auth-Token": token, "Content-Type": "application/json" },
      agent
    });
    console.log(`   ThermalSubsystem: ${thermalSubResp.status} ${thermalSubResp.statusText}`);
    if (thermalSubResp.ok) {
      const data = await thermalSubResp.json();
      console.log(`   ✅ Status: ${JSON.stringify(data.Status)}`);
      if (data.Fans) {
        console.log(`   ✅ Fans Link: ${data.Fans['@odata.id']}`);
      }
      if (data.ThermalMetrics) {
        console.log(`   ✅ ThermalMetrics Link: ${data.ThermalMetrics['@odata.id']}`);
      }
    }
    console.log("");

    // 4. 测试旧版 Thermal API (备用)
    console.log("4️⃣  测试 Thermal API (Legacy)");
    const thermalUrl = `https://${BMC_IP}/redfish/v1/Chassis/1/Thermal`;
    const thermalResp = await fetch(thermalUrl, {
      method: "GET",
      headers: { "X-Auth-Token": token, "Content-Type": "application/json" },
      agent
    });
    console.log(`   Thermal (Legacy): ${thermalResp.status} ${thermalResp.statusText}`);
    if (thermalResp.ok) {
      const data = await thermalResp.json();
      console.log(`   ✅ Temperatures count: ${data.Temperatures?.length || 0}`);
      console.log(`   ✅ Fans count: ${data.Fans?.length || 0}`);
      if (data.Temperatures && data.Temperatures.length > 0) {
        const temp = data.Temperatures[0];
        console.log(`   ✅ Sample Temperature: ${temp.Name} = ${temp.ReadingCelsius}°C`);
      }
    }
    console.log("");

    console.log("========================================");
    console.log("API 支持总结");
    console.log("========================================");
    console.log(`PowerSubsystem (新版): ${powerSubResp.ok ? '✅ 支持' : '❌ 不支持'}`);
    console.log(`EnvironmentMetrics: ${envResp.ok ? '✅ 支持' : '❌ 不支持'}`);
    console.log(`ThermalSubsystem (新版): ${thermalSubResp.ok ? '✅ 支持' : '❌ 不支持'}`);
    console.log(`Thermal (旧版): ${thermalResp.ok ? '✅ 支持' : '❌ 不支持'}`);
    console.log("========================================\n");

  } finally {
    await deleteSession(BMC_IP, token, location);
    console.log("Session closed");
  }
}

testMonitoringTools().catch(console.error);

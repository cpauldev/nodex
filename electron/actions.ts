import { app, shell } from "electron";
import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ActionResult, RecordActionInput, SignalRecord } from "./types.js";
import { commandError, powerShellLiteral, runCommand, runPowerShell } from "./windows.js";

function result(message: string, ok = true): ActionResult {
  return { message: message.trim(), ok };
}

function allowed(input: RecordActionInput): boolean {
  const { action, record } = input;
  if (action.startsWith("wifi-")) return record.kind === "wifi" && record.recordClass === "observed";
  if (action.startsWith("bluetooth-")) return record.kind === "bluetooth" && record.recordClass === "known";
  if (action === "network-ping") return record.kind === "network" && record.recordClass === "neighbor";
  if (action.startsWith("adapter-")) return record.kind === "adapter" && record.recordClass === "infrastructure";
  return false;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function connectWifi(record: SignalRecord, password?: string): Promise<ActionResult> {
  if (!record.name || record.name === "(hidden network)") {
    return result("A visible network name is required.", false);
  }

  try {
    if (password) {
      const authentication = String(record.details.Authentication ?? "");
      const auth = authentication.toUpperCase().includes("WPA3") ? "WPA3SAE" : "WPA2PSK";
      const profilePath = path.join(app.getPath("temp"), `nodex-${Date.now()}.xml`);
      const profile = `<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>${escapeXml(record.name)}</name><SSIDConfig><SSID><name>${escapeXml(record.name)}</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>auto</connectionMode><MSM><security><authEncryption><authentication>${auth}</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption><sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>${escapeXml(password)}</keyMaterial></sharedKey></security></MSM></WLANProfile>`;
      await writeFile(profilePath, profile, { encoding: "utf8", mode: 0o600 });
      try {
        await runCommand("netsh.exe", ["wlan", "add", "profile", `filename=${profilePath}`, "user=current"]);
      } finally {
        await unlink(profilePath).catch(() => undefined);
      }
    }

    const output = await runCommand("netsh.exe", ["wlan", "connect", `name=${record.name}`, `ssid=${record.name}`]);
    return result(output.stdout || output.stderr || `Connection requested for ${record.name}.`);
  } catch (error) {
    return result(commandError(error, "Windows could not connect to this network."), false);
  }
}

async function disconnectWifi(): Promise<ActionResult> {
  try {
    const output = await runCommand("netsh.exe", ["wlan", "disconnect"]);
    return result(output.stdout || output.stderr || "Disconnected from Wi-Fi.");
  } catch (error) {
    return result(commandError(error, "Windows could not disconnect Wi-Fi."), false);
  }
}

async function setPnpDevice(record: SignalRecord, enabled: boolean): Promise<ActionResult> {
  const instanceId = String(record.details["Instance ID"] ?? "");
  if (!instanceId) return result("This Bluetooth record has no Windows device identifier.", false);

  const command = enabled ? "Enable-PnpDevice" : "Disable-PnpDevice";
  try {
    await runPowerShell(`${command} -InstanceId ${powerShellLiteral(instanceId)} -Confirm:$false -ErrorAction Stop`);
    return result(`${record.name} was ${enabled ? "enabled" : "disabled"} in Windows.`);
  } catch (error) {
    return result(commandError(error, `Windows could not ${enabled ? "enable" : "disable"} this Bluetooth device. Administrator permission may be required.`), false);
  }
}

async function pingNeighbor(record: SignalRecord): Promise<ActionResult> {
  const address = String(record.details["IP address"] ?? record.name);
  if (!address) return result("This network record has no IP address.", false);
  try {
    const output = await runCommand("ping.exe", ["-n", "2", "-w", "1500", address]);
    return result(output.stdout || `${address} responded.`);
  } catch (error) {
    return result(commandError(error, `${address} did not respond.`), false);
  }
}

async function setAdapter(record: SignalRecord, enabled: boolean): Promise<ActionResult> {
  const command = enabled ? "Enable-NetAdapter" : "Disable-NetAdapter";
  try {
    await runPowerShell(`${command} -Name ${powerShellLiteral(record.name)} -Confirm:$false -ErrorAction Stop`);
    return result(`${record.name} was ${enabled ? "enabled" : "disabled"}.`);
  } catch (error) {
    return result(commandError(error, `Windows could not ${enabled ? "enable" : "disable"} this adapter. Administrator permission may be required.`), false);
  }
}

export async function performRecordAction(input: RecordActionInput): Promise<ActionResult> {
  if (!allowed(input)) return result("This action is not supported for the selected record.", false);

  switch (input.action) {
    case "wifi-connect":
      return connectWifi(input.record, input.password);
    case "wifi-disconnect":
      return disconnectWifi();
    case "bluetooth-settings":
      await shell.openExternal("ms-settings:bluetooth");
      return result("Opened Windows Bluetooth pairing controls.");
    case "bluetooth-enable":
      return setPnpDevice(input.record, true);
    case "bluetooth-disable":
      return setPnpDevice(input.record, false);
    case "network-ping":
      return pingNeighbor(input.record);
    case "adapter-enable":
      return setAdapter(input.record, true);
    case "adapter-disable":
      return setAdapter(input.record, false);
  }
}

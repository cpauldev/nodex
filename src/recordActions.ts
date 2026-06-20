import type { RecordActionId, SignalRecord } from "./types";

export interface RecordAction {
  description: string;
  destructive?: boolean;
  id: RecordActionId;
  label: string;
  password?: boolean;
}

export function getRecordActions(record: SignalRecord): RecordAction[] {
  if (record.kind === "wifi" && record.recordClass === "observed" && record.name !== "(hidden network)") {
    const connected = record.status === "Connected";
    const savedProfile = record.details["Saved profile"] === true;
    return connected
      ? [{
          description: "Disconnect this PC from the current Wi-Fi network.",
          destructive: true,
          id: "wifi-disconnect",
          label: "Disconnect"
        }]
      : [{
          description: savedProfile
            ? "Connect using the Wi-Fi profile already stored by Windows."
            : "Create a Windows Wi-Fi profile using the supplied password, then connect.",
          id: "wifi-connect",
          label: "Connect",
          password: !savedProfile
        }];
  }

  if (record.kind === "bluetooth") {
    const present = record.details.Present === true;
    return [
      {
        description: "Open Windows Bluetooth controls to pair, remove, or manage profile-level connections.",
        id: "bluetooth-settings",
        label: "Pairing controls"
      },
      present
        ? {
            description: "Disable this Windows Bluetooth device node. This is not the same as disconnecting a specific Bluetooth profile.",
            destructive: true,
            id: "bluetooth-disable",
            label: "Disable device"
          }
        : {
            description: "Re-enable this Windows Bluetooth device node.",
            id: "bluetooth-enable",
            label: "Enable device"
          }
    ];
  }

  if (record.recordClass === "neighbor") {
    return [{
      description: "Send two ICMP echo requests to test whether the network neighbor responds.",
      id: "network-ping",
      label: "Test reachability"
    }];
  }

  if (record.kind === "adapter") {
    const enabled = record.status.toLocaleLowerCase() !== "disabled";
    return [{
      description: `${enabled ? "Disable" : "Enable"} this Windows network adapter. Administrator permission may be required.`,
      destructive: enabled,
      id: enabled ? "adapter-disable" : "adapter-enable",
      label: enabled ? "Disable adapter" : "Enable adapter"
    }];
  }

  return [];
}

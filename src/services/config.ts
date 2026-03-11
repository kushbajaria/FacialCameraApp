import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEFAULT_PI_IP = '192.168.1.100';
export const DEFAULT_PI_PORT = '8000';
export const DEFAULT_PI_BASE_URL = `http://${DEFAULT_PI_IP}:${DEFAULT_PI_PORT}`;

const PI_IP_KEY = '@pi_connection_ip';
const PI_PORT_KEY = '@pi_connection_port';

export interface PiConnectionSettings {
  ip: string;
  port: string;
}

function parseDefaultPiSettings(): PiConnectionSettings {
  try {
    const url = new URL(DEFAULT_PI_BASE_URL);
    return {
      ip: url.hostname || DEFAULT_PI_IP,
      port: url.port || DEFAULT_PI_PORT,
    };
  } catch {
    return { ip: DEFAULT_PI_IP, port: DEFAULT_PI_PORT };
  }
}

function isValidIPv4(ip: string): boolean {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

function isValidPort(port: string): boolean {
  if (!/^\d+$/.test(port.trim())) return false;
  const n = Number(port);
  return n >= 1 && n <= 65535;
}

export async function getPiConnectionSettings(): Promise<PiConnectionSettings> {
  const defaults = parseDefaultPiSettings();
  try {
    const [ip, port] = await Promise.all([
      AsyncStorage.getItem(PI_IP_KEY),
      AsyncStorage.getItem(PI_PORT_KEY),
    ]);

    return {
      ip: ip?.trim() || defaults.ip,
      port: port?.trim() || defaults.port,
    };
  } catch {
    return defaults;
  }
}

export async function setPiConnectionSettings(ip: string, port: string): Promise<void> {
  const cleanIp = ip.trim();
  const cleanPort = port.trim();

  if (!isValidIPv4(cleanIp)) {
    throw new Error('Please enter a valid IPv4 address (example: 192.168.1.100).');
  }
  if (!isValidPort(cleanPort)) {
    throw new Error('Please enter a valid port between 1 and 65535.');
  }

  await Promise.all([
    AsyncStorage.setItem(PI_IP_KEY, cleanIp),
    AsyncStorage.setItem(PI_PORT_KEY, cleanPort),
  ]);
}

export async function getEffectivePiBaseUrl(): Promise<string> {
  const { ip, port } = await getPiConnectionSettings();
  return `http://${ip}:${port}`;
}

export async function getCameraStreamUrl(timestamp: number): Promise<string> {
  const baseUrl = await getEffectivePiBaseUrl();
  return `${baseUrl}/camera/stream?t=${encodeURIComponent(String(timestamp))}`;
}

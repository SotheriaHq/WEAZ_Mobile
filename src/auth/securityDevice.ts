import AsyncStorage from '@react-native-async-storage/async-storage';
import { uuid } from 'expo-modules-core';

const KEY = 'wiez.security-device.v1';
let device: Promise<string> | null = null;

/** Essential account-security grouping hint; never a credential or analytics ID. */
export function getSecurityDeviceId(): Promise<string> {
  if (!device) device = (async () => {
    let saved: string | null = null;
    try { saved = await AsyncStorage.getItem(KEY); } catch { /* Storage may be unavailable. */ }
    if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved;
    const id = uuid.v4();
    try { await AsyncStorage.setItem(KEY, id); } catch { /* Keep the process-local hint. */ }
    return id;
  })().catch((error) => { device = null; throw error; });
  return device;
}

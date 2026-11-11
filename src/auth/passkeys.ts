import { Platform } from 'react-native';
import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from '@simplewebauthn/browser';
import { SecurityVerificationCancelled, SecurityVerificationError } from './securityChallenge';

export type PasskeyAvailability = { available: boolean; message: string | null };
let loading: Promise<typeof import('react-native-passkeys')> | null = null;
async function sdk() {
  if (Platform.OS === 'ios') throw new SecurityVerificationError('Passkeys are not available in this WIEZ iOS release. Use an authenticator app or recovery code.');
  if (!loading) loading = import('react-native-passkeys').catch(error => { loading = null; throw error; });
  return loading;
}
export async function passkeyAvailability(configuration: { webConfigured: boolean; androidConfigured: boolean }): Promise<PasskeyAvailability> {
  if (Platform.OS === 'ios') return { available: false, message: 'Passkeys are not available in this WIEZ iOS release. Use an authenticator app or recovery code.' };
  if (!(Platform.OS === 'android' ? configuration.androidConfigured : configuration.webConfigured))
    return { available: false, message: 'Passkeys are not available here yet. Use an authenticator app or recovery code.' };
  try { const available = (await sdk()).isSupported(); return { available,
    message: available ? null : 'Passkeys cannot be used on this device. Use an authenticator app or recovery code.' }; }
  catch { return { available: false, message: 'Passkeys cannot be used in this app installation. Use an authenticator app or recovery code.' }; }
}
function failure(error: unknown) {
  return error instanceof SecurityVerificationError ? error : new SecurityVerificationError(
    'The passkey was not completed. If you cancelled, try again when ready; otherwise choose an authenticator or recovery code.');
}
let active = false;
async function ceremony<T>(work: () => Promise<T>, signal?: AbortSignal) {
  if (signal?.aborted) throw new SecurityVerificationCancelled();
  if (active) throw new SecurityVerificationError('Finish or cancel the current passkey prompt, then try again.');
  active = true;
  // This SDK cannot dismiss Android's system prompt. An aborted result never reaches the API.
  try { const result = await work(); if (signal?.aborted) throw new SecurityVerificationCancelled(); return result; }
  catch (error) { if (error instanceof SecurityVerificationCancelled) throw error; throw failure(error); }
  finally { active = false; }
}
export function createPasskey(options: PublicKeyCredentialCreationOptionsJSON, signal?: AbortSignal): Promise<RegistrationResponseJSON> {
  return ceremony(async () => {
    const module = await sdk();
    if (signal?.aborted) throw new SecurityVerificationCancelled();
    const result = await module.create(options as unknown as Parameters<typeof module.create>[0]);
    if (!result) throw new SecurityVerificationError('The passkey prompt was cancelled. Try again or choose another method.');
    // The native wrapper adds a getPublicKey function; keep only its standard JSON response.
    return JSON.parse(JSON.stringify(result)) as RegistrationResponseJSON;
  }, signal);
}
export function authenticatePasskey(options: PublicKeyCredentialRequestOptionsJSON, signal?: AbortSignal): Promise<AuthenticationResponseJSON> {
  return ceremony(async () => {
    const module = await sdk();
    if (signal?.aborted) throw new SecurityVerificationCancelled();
    const result = await module.get(options as unknown as Parameters<typeof module.get>[0]);
    if (!result) throw new SecurityVerificationError('The passkey prompt was cancelled. Try again or choose another method.');
    return JSON.parse(JSON.stringify(result)) as AuthenticationResponseJSON;
  }, signal);
}

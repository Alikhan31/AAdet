import * as SecureStore from "expo-secure-store";

const KEY = "adet_token";

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY);
}

export async function setToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(KEY, token);
}

export async function clearToken(): Promise<void> {
  return SecureStore.deleteItemAsync(KEY);
}

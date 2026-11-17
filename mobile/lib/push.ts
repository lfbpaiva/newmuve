import { isRunningInExpoGo } from "expo";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { useRouter, type Href } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { registerDevice, unregisterDevice } from "../../shared/client/account.ts";
import { chaveDaAbertura, criarRegistroDeAberturas, destinoDaNotificacao } from "./notificacaoLink";
import { pushRemotoDisponivel } from "./pushRemoto";

let registeredToken: string | null = null;
const primeiraAbertura = criarRegistroDeAberturas();

async function loadNotifications() {
  if (!pushRemotoDisponivel({ plataforma: Platform.OS, dispositivoFisico: Device.isDevice, expoGo: isRunningInExpoGo() })) return null;
  try {
    const Notifications = await import("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    return Notifications;
  } catch {
    return null;
  }
}

async function pushToken(): Promise<string | null> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const Notifications = await loadNotifications();
  if (!projectId || !Notifications) return null;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", { name: "Avisos da Muve", importance: Notifications.AndroidImportance.HIGH });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return null;
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}

export async function forgetPushToken(): Promise<void> {
  if (!registeredToken) return;
  await unregisterDevice(registeredToken).catch(() => {});
  registeredToken = null;
}

export function usePushNotifications(signedIn: boolean) {
  const router = useRouter();

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    pushToken().then((token) => {
      if (!active || !token) return;
      registeredToken = token;
      void registerDevice(token).catch(() => {});
    });
    return () => {
      active = false;
    };
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    let remove: (() => void) | null = null;
    void loadNotifications().then(async (Notifications) => {
      if (!Notifications || !active) return;
      const abrir = (response: Awaited<ReturnType<typeof Notifications.getLastNotificationResponseAsync>>) => {
        if (!active || !response || !primeiraAbertura(chaveDaAbertura(response))) return;
        const destino = destinoDaNotificacao(response.notification.request.content.data?.link);
        if (destino) router.push(destino as Href);
      };
      const subscription = Notifications.addNotificationResponseReceivedListener(abrir);
      remove = () => subscription.remove();
      const ultima = await Notifications.getLastNotificationResponseAsync().catch(() => null);
      if (!ultima || !active) return;
      abrir(ultima);
      await Notifications.clearLastNotificationResponseAsync().catch(() => {});
    });
    return () => {
      active = false;
      remove?.();
    };
  }, [signedIn, router]);
}

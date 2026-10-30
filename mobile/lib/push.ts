import Constants from "expo-constants";
import * as Device from "expo-device";
import { useRouter, type Href } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { registerDevice, unregisterDevice } from "../../shared/client/account.ts";

let registeredToken: string | null = null;

async function loadNotifications() {
  if (Platform.OS === "web" || !Device.isDevice) return null;
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
    let remove: (() => void) | null = null;
    void loadNotifications().then((Notifications) => {
      if (!Notifications) return;
      const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const link = response.notification.request.content.data?.link;
        if (typeof link === "string" && link.startsWith("/")) router.push(link as Href);
      });
      remove = () => subscription.remove();
    });
    return () => remove?.();
  }, [router]);
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PushGateway } from "../services/notifications.ts";

interface ExpoTicket {
  status: "ok" | "error";
  details?: { error?: string };
}

export function createExpoPush(admin: SupabaseClient): PushGateway {
  async function tokensOf(userId: string): Promise<string[]> {
    const { data, error } = await admin.from("push_tokens").select("token").eq("user_id", userId);
    if (error) throw error;
    return data.map((row) => row.token);
  }

  return {
    async register(userId, token) {
      const { error } = await admin.from("push_tokens").upsert({ token, user_id: userId, updated_at: new Date().toISOString() });
      if (error) throw error;
    },

    async unregister(userId, token) {
      const { error } = await admin.from("push_tokens").delete().eq("token", token).eq("user_id", userId);
      if (error) throw error;
    },

    async send(userId, message) {
      const tokens = await tokensOf(userId);
      if (tokens.length === 0) return;
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(tokens.map((to) => ({ to, title: message.titulo, body: message.texto, data: { link: message.link }, sound: "default" }))),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Expo push respondeu ${response.status}`);
      const { data } = (await response.json()) as { data: ExpoTicket[] };
      const invalid = tokens.filter((_, i) => data[i]?.details?.error === "DeviceNotRegistered");
      if (invalid.length > 0) await admin.from("push_tokens").delete().in("token", invalid);
    },
  };
}

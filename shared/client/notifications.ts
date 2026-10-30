import { apiRequest } from "./api.ts";
import { supabase } from "./config.ts";
import { unwrap } from "./events.ts";

export interface AppNotification {
  id: string;
  titulo: string;
  texto: string;
  link: string | null;
  lida: boolean;
  createdAt: string;
}

interface NotificationRow {
  id: string;
  titulo: string;
  texto: string;
  link: string | null;
  lida: boolean;
  created_at: string;
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  const result = await supabase().from("notifications").select("id, titulo, texto, link, lida, created_at").order("created_at", { ascending: false }).limit(50);
  return unwrap<NotificationRow[]>(result).map((row) => ({ id: row.id, titulo: row.titulo, texto: row.texto, link: row.link, lida: row.lida, createdAt: row.created_at }));
}

export async function countUnreadNotifications(): Promise<number> {
  const { count, error } = await supabase().from("notifications").select("id", { count: "exact", head: true }).eq("lida", false);
  if (error) unwrap({ data: null, error });
  return count ?? 0;
}

export const markNotificationsRead = () => apiRequest("/me/notificacoes/lidas", { method: "POST" });

export function subscribeToNotifications(userId: string, onChange: () => void): () => void {
  const channel = supabase()
    .channel(`notificacoes:${userId}:${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, onChange)
    .subscribe();
  return () => void supabase().removeChannel(channel);
}

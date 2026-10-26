import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProStore, ProSubscription } from "../services/proService.ts";

interface SubscriptionRow {
  musician_id: string;
  asaas_subscription_id: string;
  status: ProSubscription["status"];
  valor: number | string;
}

const toSubscription = (row: SubscriptionRow): ProSubscription => ({
  musicianId: row.musician_id,
  asaasSubscriptionId: row.asaas_subscription_id,
  status: row.status,
  valor: Number(row.valor),
});

export function createProStore(admin: SupabaseClient): ProStore {
  async function findBy(column: string, value: string): Promise<ProSubscription | null> {
    const { data, error } = await admin.from("pro_subscriptions").select("*").eq(column, value).maybeSingle();
    if (error) throw error;
    return data && toSubscription(data);
  }

  return {
    findSubscription: (musicianId) => findBy("musician_id", musicianId),
    findSubscriptionByAsaasId: (asaasSubscriptionId) => findBy("asaas_subscription_id", asaasSubscriptionId),

    async saveSubscription(subscription) {
      const { error } = await admin.from("pro_subscriptions").upsert({
        musician_id: subscription.musicianId,
        asaas_subscription_id: subscription.asaasSubscriptionId,
        status: subscription.status,
        valor: subscription.valor,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },

    async setSubscriptionStatus(musicianId, status) {
      const { error } = await admin.from("pro_subscriptions").update({ status, updated_at: new Date().toISOString() }).eq("musician_id", musicianId);
      if (error) throw error;
    },

    async getCustomerId(musicianId) {
      const { data, error } = await admin.from("musician_profiles").select("asaas_customer_id").eq("user_id", musicianId).maybeSingle();
      if (error) throw error;
      return data?.asaas_customer_id ?? null;
    },

    async setCustomerId(musicianId, customerId) {
      const { error } = await admin.from("musician_profiles").update({ asaas_customer_id: customerId }).eq("user_id", musicianId);
      if (error) throw error;
    },

    async activate(musicianId, asaasPaymentId, dias) {
      const { data, error } = await admin.rpc("activate_pro", { p_musician_id: musicianId, p_asaas_payment_id: asaasPaymentId, p_dias: dias });
      if (error) throw error;
      return data ? new Date(data as string) : null;
    },
  };
}

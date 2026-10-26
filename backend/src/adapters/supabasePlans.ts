import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "../domain/account.ts";
import type { PlanStore, PlanSubscription } from "../services/planService.ts";

interface SubscriptionRow {
  user_id: string;
  plano: PlanSubscription["plano"];
  asaas_subscription_id: string;
  status: PlanSubscription["status"];
  valor: number | string;
}

const toSubscription = (row: SubscriptionRow): PlanSubscription => ({
  userId: row.user_id,
  plano: row.plano,
  asaasSubscriptionId: row.asaas_subscription_id,
  status: row.status,
  valor: Number(row.valor),
});

const profileTable = (role: Role) => (role === "MUSICIAN" ? "musician_profiles" : "contractor_profiles");

export function createPlanStore(admin: SupabaseClient): PlanStore {
  async function findBy(column: string, value: string): Promise<PlanSubscription | null> {
    const { data, error } = await admin.from("subscriptions").select("*").eq(column, value).maybeSingle();
    if (error) throw error;
    return data && toSubscription(data);
  }

  return {
    findSubscription: (userId) => findBy("user_id", userId),
    findSubscriptionByAsaasId: (asaasSubscriptionId) => findBy("asaas_subscription_id", asaasSubscriptionId),

    async saveSubscription(subscription) {
      const { error } = await admin.from("subscriptions").upsert({
        user_id: subscription.userId,
        plano: subscription.plano,
        asaas_subscription_id: subscription.asaasSubscriptionId,
        status: subscription.status,
        valor: subscription.valor,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },

    async setSubscriptionStatus(userId, status) {
      const { error } = await admin.from("subscriptions").update({ status, updated_at: new Date().toISOString() }).eq("user_id", userId);
      if (error) throw error;
    },

    async getCustomerId(userId, role) {
      const { data, error } = await admin.from(profileTable(role)).select("asaas_customer_id").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data?.asaas_customer_id ?? null;
    },

    async setCustomerId(userId, role, customerId) {
      const { error } = await admin.from(profileTable(role)).update({ asaas_customer_id: customerId }).eq("user_id", userId);
      if (error) throw error;
    },

    async activate(userId, asaasPaymentId, dias) {
      const { data, error } = await admin.rpc("activate_plan", { p_user_id: userId, p_asaas_payment_id: asaasPaymentId, p_dias: dias });
      if (error) throw error;
      return data ? new Date(data as string) : null;
    },
  };
}

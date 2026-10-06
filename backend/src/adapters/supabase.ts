import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Account, Role } from "../domain/account.ts";
import { AppError } from "../domain/errors.ts";
import type { AccountStore, AuthGateway, AuthUser, ImageBucket, ImageStore } from "../services/accountService.ts";

const UNIQUE_VIOLATION = "23505";
const serverOnly = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export function createAdminClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, serverOnly);
}

const detailTable = (role: Role) => (role === "MUSICIAN" ? "musician_profiles" : "contractor_profiles");
const nameColumn = (role: Role) => (role === "MUSICIAN" ? "nome_completo" : "nome_fantasia");

export function createAccountStore(admin: SupabaseClient): AccountStore {
  return {
    async documentExists(documento, exceptUserId) {
      for (const table of ["musician_profiles", "contractor_profiles"]) {
        let query = admin.from(table).select("user_id").eq("documento", documento);
        if (exceptUserId) query = query.neq("user_id", exceptUserId);
        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        if (data) return true;
      }
      return false;
    },

    async createProfile(userId, profile) {
      const base = await admin.from("profiles").insert({ id: userId, role: profile.role });
      if (base.error) throw base.error;
      const detail = await admin.from(detailTable(profile.role)).insert({ user_id: userId, [nameColumn(profile.role)]: profile.nome });
      if (detail.error) throw detail.error;
    },

    async findAccount(userId) {
      const base = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (base.error) throw base.error;
      if (!base.data) return null;
      const role = base.data.role as Role;

      const { data, error } = await admin.from(detailTable(role)).select("*").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const account: Account = {
        id: userId,
        role,
        nome: data[nameColumn(role)],
        documento: data.documento,
        telefone: data.telefone,
        uf: data.uf,
        cidade: data.cidade,
        fotoPerfilUrl: data.foto_perfil_url,
        avaliacaoMedia: Number(data.avaliacao_media),
        totalAvaliacoes: data.total_avaliacoes,
      };
      if (role === "MUSICIAN") {
        account.bio = data.bio;
        account.estilosMusicais = data.estilos_musicais;
        account.chavePixTipo = data.chave_pix_tipo;
        account.chavePix = data.chave_pix;
        account.portfolioUrl = data.portfolio_url;
      }
      return account;
    },

    async findEmail(userId) {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error) throw error;
      return data.user?.email ?? null;
    },

    // Só grava o que veio na requisição; campo ausente não apaga o valor atual.
    async updateProfile(userId, role, changes) {
      const row: Record<string, unknown> = { [nameColumn(role)]: changes.nome };
      if (changes.documento !== undefined) row.documento = changes.documento;
      if (changes.telefone !== undefined) row.telefone = changes.telefone;
      if (changes.uf !== undefined) row.uf = changes.uf;
      if (changes.cidade !== undefined) row.cidade = changes.cidade;
      if (changes.fotoPerfilUrl) row.foto_perfil_url = changes.fotoPerfilUrl;
      if ("estilosMusicais" in changes) {
        if (changes.estilosMusicais !== undefined) row.estilos_musicais = changes.estilosMusicais;
        if (changes.bio !== undefined) row.bio = changes.bio;
        if (changes.portfolioUrl !== undefined) row.portfolio_url = changes.portfolioUrl;
        if (changes.chavePix !== undefined) {
          row.chave_pix = changes.chavePix;
          row.chave_pix_tipo = changes.chavePixTipo;
        }
      }
      const { error } = await admin.from(detailTable(role)).update(row).eq("user_id", userId);
      if (error?.code === UNIQUE_VIOLATION) throw new AppError(409, "DOCUMENTO_EM_USO", "Este CPF/CNPJ já está vinculado a outra conta.");
      if (error) throw error;
    },
  };
}

// signUp e signInWithPassword usam a chave pública: assim valem as mesmas regras
// do Supabase Auth aplicadas a qualquer cliente (e-mail de confirmação, limites de tentativas).
export function createAuthGateway(admin: SupabaseClient, url: string, anonKey: string): AuthGateway {
  const publicClient = () => createClient(url, anonKey, serverOnly);

  return {
    async signUp(email, password, redirectTo) {
      const { data, error } = await publicClient().auth.signUp({
        email,
        password,
        options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
      });
      if (error?.code === "user_already_exists" || error?.code === "email_exists") return { emailTaken: true };
      if (error?.code === "over_email_send_rate_limit" || error?.code === "over_request_rate_limit") {
        throw new AppError(429, "LIMITE_DE_ENVIO", "Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.");
      }
      if (error?.code === "weak_password") throw new AppError(400, "SENHA_FRACA", "Escolha uma senha mais forte.");
      if (error?.code === "email_address_invalid") throw new AppError(400, "EMAIL_INVALIDO", "Informe um e-mail válido.");
      if (error) throw error;
      // Com confirmação de e-mail ativa, um e-mail já confirmado volta como usuário sem identidades.
      if (!data.user || (data.user.identities ?? []).length === 0) return { emailTaken: true };
      return { userId: data.user.id };
    },

    async verifyPassword(email, password) {
      const { error } = await publicClient().auth.signInWithPassword({ email, password });
      if (!error) return true;
      if (error.code === "invalid_credentials") return false;
      throw error;
    },

    async deleteUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
    },
  };
}

export function createImageStore(admin: SupabaseClient): ImageStore {
  const extension = (type: string) => (type === "image/jpeg" ? "jpg" : type.split("/")[1]);
  const publicPrefix = (bucket: ImageBucket) => `/storage/v1/object/public/${bucket}/`;

  return {
    async upload(bucket, ownerId, file) {
      const path = `${ownerId}/${crypto.randomUUID()}.${extension(file.type)}`;
      const { error } = await admin.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      return admin.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    },

    async removeByUrl(bucket, url) {
      const index = url.indexOf(publicPrefix(bucket));
      if (index === -1) return;
      const path = decodeURIComponent(url.slice(index + publicPrefix(bucket).length));
      const { error } = await admin.storage.from(bucket).remove([path]);
      if (error) throw error;
    },

    async removeAllOf(bucket, ownerId) {
      const { data, error } = await admin.storage.from(bucket).list(ownerId);
      if (error) throw error;
      if (!data.length) return;
      const removed = await admin.storage.from(bucket).remove(data.map((file) => `${ownerId}/${file.name}`));
      if (removed.error) throw removed.error;
    },
  };
}

export function createTokenVerifier(admin: SupabaseClient) {
  return async (token: string): Promise<AuthUser | null> => {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user?.email) return null;
    return { id: data.user.id, email: data.user.email };
  };
}

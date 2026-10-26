import { camposFaltantes, descreverFaltantes, imageProblem, TERMOS_VERSAO, type AcaoPerfil } from "../../../shared/dominio.ts";
import type { Account, DeleteAccountInput, ProfileChanges, Role, SignupInput } from "../domain/account.ts";
import { AppError } from "../domain/errors.ts";

export interface AccountStore {
  documentExists(documento: string, exceptUserId?: string): Promise<boolean>;
  createProfile(userId: string, profile: { role: Role; nome: string }): Promise<void>;
  findAccount(userId: string): Promise<Account | null>;
  findEmail(userId: string): Promise<string | null>;
  updateProfile(userId: string, role: Role, changes: ProfileChanges & { fotoPerfilUrl?: string }): Promise<void>;
}

export interface AuthGateway {
  signUp(email: string, password: string, termosVersao: string, redirectTo?: string): Promise<{ userId: string } | { emailTaken: true }>;
  verifyPassword(email: string, password: string): Promise<boolean>;
  deleteUser(userId: string): Promise<void>;
}

export type ImageBucket = "avatars" | "event-banners";

export interface ImageStore {
  upload(bucket: ImageBucket, ownerId: string, file: File): Promise<string>;
  removeByUrl(bucket: ImageBucket, url: string): Promise<void>;
  removeAllOf(bucket: ImageBucket, ownerId: string): Promise<void>;
}

export interface AuthUser {
  id: string;
  email: string;
}

const emailEmUso = () => new AppError(409, "EMAIL_EM_USO", "Este e-mail já está vinculado a uma conta.");
const contaNaoEncontrada = () => new AppError(404, "CONTA_NAO_ENCONTRADA", "Conta não encontrada.");

export function assertProfileComplete(account: Account, acao: AcaoPerfil): void {
  const faltando = camposFaltantes(account, acao);
  if (faltando.length === 0) return;
  throw new AppError(409, "PERFIL_INCOMPLETO", `Complete seu perfil antes de continuar. Falta: ${descreverFaltantes(faltando)}.`);
}

export function createAccountService(deps: {
  store: AccountStore;
  auth: AuthGateway;
  images: ImageStore;
  hasOngoingHiring(userId: string): Promise<boolean>;
}) {
  const { store, auth, images } = deps;

  return {
    async signup(input: SignupInput, redirectTo?: string): Promise<void> {
      const created = await auth.signUp(input.email, input.password, TERMOS_VERSAO, redirectTo);
      if ("emailTaken" in created) throw emailEmUso();
      const { userId } = created;
      if (await store.findAccount(userId)) throw emailEmUso();

      try {
        await store.createProfile(userId, { role: input.role, nome: input.nome });
      } catch (error) {
        await auth.deleteUser(userId).catch((cleanupError) => {
          console.error("Falha ao desfazer cadastro incompleto", userId, cleanupError);
        });
        throw error;
      }
    },

    async getMe(user: AuthUser): Promise<Account & { email: string }> {
      const account = await store.findAccount(user.id);
      if (!account) throw contaNaoEncontrada();
      return { ...account, email: user.email };
    },

    async updateProfile(user: AuthUser, role: Role, changes: ProfileChanges, avatar: File | null): Promise<void> {
      const current = await store.findAccount(user.id);
      if (!current) throw contaNaoEncontrada();
      if (changes.documento && changes.documento !== current.documento && (await store.documentExists(changes.documento, user.id))) {
        throw new AppError(409, "DOCUMENTO_EM_USO", "Este CPF/CNPJ já está vinculado a outra conta.");
      }

      if (!avatar) {
        await store.updateProfile(user.id, role, changes);
        return;
      }
      const problem = imageProblem(avatar);
      if (problem) throw new AppError(400, "IMAGEM_INVALIDA", problem);
      const fotoPerfilUrl = await images.upload("avatars", user.id, avatar);
      try {
        await store.updateProfile(user.id, role, { ...changes, fotoPerfilUrl });
      } catch (error) {
        await images.removeByUrl("avatars", fotoPerfilUrl).catch(() => {});
        throw error;
      }
      if (current.fotoPerfilUrl) await images.removeByUrl("avatars", current.fotoPerfilUrl).catch(() => {});
    },

    async deleteAccount(user: AuthUser, input: DeleteAccountInput): Promise<void> {
      const naoConfere = new AppError(400, "CREDENCIAIS_NAO_CONFEREM", "E-mail ou senha não correspondem à conta atual.");
      if (input.email !== user.email.toLowerCase()) throw naoConfere;
      if (!(await auth.verifyPassword(user.email, input.password))) throw naoConfere;

      if (await deps.hasOngoingHiring(user.id)) {
        throw new AppError(
          409,
          "CONTRATACAO_EM_ANDAMENTO",
          "Você tem um show contratado em andamento. Conclua ou cancele a contratação antes de excluir a conta.",
        );
      }

      await auth.deleteUser(user.id);
      await images.removeAllOf("avatars", user.id).catch(() => {});
      await images.removeAllOf("event-banners", user.id).catch(() => {});
    },
  };
}

export type AccountService = ReturnType<typeof createAccountService>;

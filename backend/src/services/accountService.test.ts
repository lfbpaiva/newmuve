import { beforeEach, describe, expect, it } from "vitest";
import type { Account, Role, SignupInput } from "../domain/account.ts";
import { AppError } from "../domain/errors.ts";
import { assertProfileComplete, createAccountService, type AccountStore, type AuthGateway, type ImageStore } from "./accountService.ts";

// Implementações em memória das portas do serviço.
function fakes() {
  const accounts = new Map<string, Account>();
  const users = new Map<string, { email: string; password: string }>();
  const images = new Set<string>();
  const state = { failCreateProfile: false, ongoingHiring: false };
  let nextId = 1;

  const store: AccountStore = {
    documentExists: async (documento, exceptUserId) => [...accounts.values()].some((a) => a.documento === documento && a.id !== exceptUserId),
    createProfile: async (userId, { role, nome }) => {
      if (state.failCreateProfile) throw new Error("falha simulada no banco");
      accounts.set(userId, { id: userId, role, nome, documento: null, telefone: null, uf: null, cidade: null, fotoPerfilUrl: null, avaliacaoMedia: 0, totalAvaliacoes: 0 });
    },
    findAccount: async (userId) => accounts.get(userId) ?? null,
    findEmail: async (userId) => users.get(userId)?.email ?? null,
    updateProfile: async (userId, _role: Role, changes) => {
      const current = accounts.get(userId)!;
      const next = { ...current };
      for (const [key, value] of Object.entries(changes)) if (value !== undefined) (next as Record<string, unknown>)[key] = value;
      accounts.set(userId, next);
    },
  };

  const auth: AuthGateway = {
    signUp: async (email, password) => {
      if ([...users.values()].some((u) => u.email === email)) return { emailTaken: true };
      const userId = `user-${nextId++}`;
      users.set(userId, { email, password });
      return { userId };
    },
    verifyPassword: async (email, password) => [...users.values()].some((u) => u.email === email && u.password === password),
    deleteUser: async (userId) => {
      users.delete(userId);
      accounts.delete(userId);
    },
  };

  const imageStore: ImageStore = {
    upload: async (bucket, ownerId, file) => {
      const url = `https://cdn.test/storage/v1/object/public/${bucket}/${ownerId}/${file.name}`;
      images.add(url);
      return url;
    },
    removeByUrl: async (_bucket, url) => void images.delete(url),
    removeAllOf: async (bucket, ownerId) => {
      for (const url of images) if (url.includes(`/${bucket}/${ownerId}/`)) images.delete(url);
    },
  };

  return {
    accounts,
    users,
    images,
    state,
    service: createAccountService({ store, auth, images: imageStore, hasOngoingHiring: async () => state.ongoingHiring }),
  };
}

const png = (name = "foto.png") => new File(["x"], name, { type: "image/png" });
const musico: SignupInput = { role: "MUSICIAN", nome: "Ana Souza", email: "ana@empresa.com.br", password: "segredo1" };
const user = { id: "user-1", email: "ana@empresa.com.br" };

describe("cadastro mínimo", () => {
  let t: ReturnType<typeof fakes>;
  beforeEach(() => {
    t = fakes();
  });

  it("cria usuário e perfil só com tipo de conta e nome", async () => {
    await t.service.signup(musico);

    expect(t.accounts.get("user-1")).toMatchObject({ role: "MUSICIAN", nome: "Ana Souza", documento: null });
  });

  it("recusa e-mail já vinculado a uma conta", async () => {
    await t.service.signup(musico);

    await expect(t.service.signup({ ...musico, nome: "Outra" })).rejects.toMatchObject({ status: 409, code: "EMAIL_EM_USO" });
  });

  it("desfaz o usuário se o perfil não puder ser gravado", async () => {
    t.state.failCreateProfile = true;

    await expect(t.service.signup(musico)).rejects.toThrow("falha simulada");
    expect(t.users.size).toBe(0);
  });
});

describe("perfil progressivo", () => {
  let t: ReturnType<typeof fakes>;
  beforeEach(async () => {
    t = fakes();
    await t.service.signup(musico);
  });

  it("completa o perfil aos poucos, sem apagar o que já foi preenchido", async () => {
    await t.service.updateProfile(user, "MUSICIAN", { nome: "Ana Souza", uf: "PR", cidade: "Cascavel", estilosMusicais: ["MPB"] }, null);
    await t.service.updateProfile(user, "MUSICIAN", { nome: "Ana Souza", telefone: "45999990000", documento: "52998224725", chavePixTipo: "CPF", chavePix: "52998224725" }, png());

    expect(t.accounts.get(user.id)).toMatchObject({ cidade: "Cascavel", estilosMusicais: ["MPB"], documento: "52998224725", chavePix: "52998224725" });
    expect(t.accounts.get(user.id)?.fotoPerfilUrl).toContain("foto.png");
  });

  it("recusa documento já usado por outra conta", async () => {
    await t.service.signup({ ...musico, email: "beto@exemplo.com" });
    await t.service.updateProfile({ id: "user-2", email: "beto@exemplo.com" }, "MUSICIAN", { nome: "Beto", documento: "52998224725" }, null);

    await expect(t.service.updateProfile(user, "MUSICIAN", { nome: "Ana", documento: "52998224725" }, null)).rejects.toMatchObject({ code: "DOCUMENTO_EM_USO" });
  });

  it("substitui a foto antiga ao enviar uma nova", async () => {
    await t.service.updateProfile(user, "MUSICIAN", { nome: "Ana" }, png("a.png"));
    const antiga = t.accounts.get(user.id)!.fotoPerfilUrl!;

    await t.service.updateProfile(user, "MUSICIAN", { nome: "Ana" }, png("b.png"));

    expect(t.images.has(antiga)).toBe(false);
    expect(t.accounts.get(user.id)?.fotoPerfilUrl).toContain("b.png");
  });

  it("exige só o que cada ação precisa, na ordem em que deve ser pedido", () => {
    const account = t.accounts.get(user.id)!;
    expect(() => assertProfileComplete(account, "feed")).toThrow(/estado e cidade, estilos musicais/);
    expect(() => assertProfileComplete(account, "candidatar")).toThrow(/estado e cidade, estilos musicais, foto de perfil, CPF ou CNPJ, telefone, chave Pix/);

    const completo: Account = { ...account, uf: "PR", cidade: "Cascavel", estilosMusicais: ["Rock"], fotoPerfilUrl: "x", documento: "1", telefone: "1", chavePix: "k" };
    expect(() => assertProfileComplete(completo, "candidatar")).not.toThrow();
    // Contratante não precisa de estilos nem de chave Pix.
    expect(() => assertProfileComplete({ ...completo, role: "CONTRACTOR", estilosMusicais: null, chavePix: null }, "criarEvento")).not.toThrow();
  });
});

describe("exclusão de conta", () => {
  let t: ReturnType<typeof fakes>;
  beforeEach(async () => {
    t = fakes();
    await t.service.signup(musico);
  });

  it("responde 404 quando não há perfil", async () => {
    await expect(t.service.getMe({ id: "desconhecido", email: "x@exemplo.com" })).rejects.toBeInstanceOf(AppError);
  });

  it("não exclui se o e-mail ou a senha não conferirem, nem com contratação em andamento", async () => {
    await expect(t.service.deleteAccount(user, { email: user.email, password: "errada" })).rejects.toMatchObject({ code: "CREDENCIAIS_NAO_CONFEREM" });
    t.state.ongoingHiring = true;
    await expect(t.service.deleteAccount(user, { email: user.email, password: "segredo1" })).rejects.toMatchObject({ code: "CONTRATACAO_EM_ANDAMENTO" });
    expect(t.accounts.size).toBe(1);
  });

  it("exclui a conta e libera o e-mail para novo cadastro", async () => {
    await t.service.deleteAccount(user, { email: user.email, password: "segredo1" });

    expect(t.accounts.size).toBe(0);
    await expect(t.service.signup(musico)).resolves.toBeUndefined();
  });
});

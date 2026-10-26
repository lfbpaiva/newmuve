import type { PostgrestError } from "@supabase/supabase-js";
import { ApiError, apiRequest } from "./api.ts";
import { appendFile, supabase, type UploadFile } from "./config.ts";

export type EventStatus = "ABERTO" | "CONTRATADO" | "CANCELADO" | "CONCLUIDO";
export type CandidateStatus = "PENDENTE" | "APROVADO" | "RECUSADO";
export type PaymentStatus = "PENDENTE" | "PAGO" | "EXPIRADO" | "CANCELADO" | "ESTORNADO";
export type PayoutStatus = "RETIDO" | "PROCESSANDO" | "REPASSADO" | "FALHOU";

export interface EventItem {
  id: string;
  contractorId: string;
  musicoContratadoId: string | null;
  titulo: string;
  tipoEvento: string;
  inicio: string;
  duracaoMinutos: number;
  uf: string;
  cidade: string;
  estilosMusicais: string[];
  formacao: string;
  somDisponivel: boolean;
  cache: number;
  imagemUrl: string;
  descricao: string | null;
  status: EventStatus;
  confirmacaoMusico: boolean;
  confirmacaoContratante: boolean;
  totalCandidatos?: number;
  distanciaKm?: number;
}

export interface EventData {
  titulo: string;
  tipoEvento: string;
  inicio: string;
  duracaoMinutos: number;
  uf: string;
  cidade: string;
  endereco: string;
  estilosMusicais: string[];
  formacao: string;
  somDisponivel: boolean;
  cache: number;
  descricao?: string;
}

export interface Application {
  id: string;
  status: CandidateStatus;
  valorProposto: number | null;
  event: EventItem;
}

export interface MyApplication {
  id: string;
  status: CandidateStatus;
  valorProposto: number | null;
}

export interface PublicProfile {
  id: string;
  nome: string;
  fotoPerfilUrl: string;
  uf: string;
  cidade: string;
  avaliacaoMedia: number;
  totalAvaliacoes: number;
}

export interface Candidate {
  id: string;
  status: CandidateStatus;
  valorProposto: number | null;
  musician: PublicProfile & { bio: string | null; estilosMusicais: string[]; portfolioUrl: string | null };
}

export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface Checkout {
  id: string;
  cache: number;
  comissao: number;
  valor: number;
  status: PaymentStatus;
  pixCopiaCola: string | null;
  pixQrCode: string | null;
  expiraEm: string;
}

export interface Hiring {
  papel: "contratante" | "musico";
  evento: {
    id: string;
    titulo: string;
    tipoEvento: string;
    inicio: string;
    duracaoMinutos: number;
    cidade: string;
    uf: string;
    endereco: string | null;
    estilosMusicais: string[];
    formacao: string;
    somDisponivel: boolean;
    status: EventStatus;
    confirmacaoMusico: boolean;
    confirmacaoContratante: boolean;
  };
  contratante: { nome: string; telefone: string; fotoPerfilUrl: string } | null;
  musico: { nome: string; telefone: string; fotoPerfilUrl: string } | null;
  pagamento: { cache: number; comissao: number; total: number; status: PaymentStatus; repasseStatus: PayoutStatus | null; refundStatus: "PROCESSANDO" | "NEGADO" | "CONFIRMADO" | null } | null;
  avaliou: boolean;
  naoComparecimento: { permitido: boolean };
  cancelamento: { permitido: boolean; reembolso: boolean };
}

interface EventRow {
  id: string;
  contractor_id: string;
  musico_contratado_id: string | null;
  titulo: string;
  tipo_evento: string;
  inicio: string;
  duracao_minutos: number;
  uf: string;
  cidade: string;
  estilos_musicais: string[];
  formacao: string;
  som_disponivel: boolean;
  cache: number | string;
  imagem_url: string;
  descricao: string | null;
  status: EventStatus;
  confirmacao_musico: boolean;
  confirmacao_contratante: boolean;
  event_candidates?: { count: number }[];
}

interface ProfileRow {
  user_id: string;
  nome_completo?: string;
  nome_fantasia?: string;
  foto_perfil_url: string;
  uf: string;
  cidade: string;
  avaliacao_media: number | string;
  total_avaliacoes: number;
}

interface CandidateRow {
  id: string;
  status: CandidateStatus;
  valor_proposto: number | string | null;
  musician: ProfileRow & { bio: string | null; estilos_musicais: string[] | null; portfolio_url: string | null };
}

export function unwrap<T>(result: { data: unknown; error: PostgrestError | null }): T {
  if (result.error || result.data === null) {
    throw new ApiError("Não foi possível carregar os dados. Verifique sua conexão e tente novamente.", 0, "FALHA_DE_LEITURA");
  }
  return result.data as T;
}

const toEvent = (row: EventRow): EventItem => ({
  id: row.id,
  contractorId: row.contractor_id,
  musicoContratadoId: row.musico_contratado_id,
  titulo: row.titulo,
  tipoEvento: row.tipo_evento,
  inicio: row.inicio,
  duracaoMinutos: row.duracao_minutos,
  uf: row.uf,
  cidade: row.cidade,
  estilosMusicais: row.estilos_musicais,
  formacao: row.formacao,
  somDisponivel: row.som_disponivel,
  cache: Number(row.cache),
  imagemUrl: row.imagem_url,
  descricao: row.descricao,
  status: row.status,
  confirmacaoMusico: row.confirmacao_musico,
  confirmacaoContratante: row.confirmacao_contratante,
  totalCandidatos: row.event_candidates?.[0]?.count,
});

const PUBLIC_PROFILE = "user_id, foto_perfil_url, uf, cidade, avaliacao_media, total_avaliacoes";
const CANDIDATE_SELECT = `id, status, valor_proposto, musician:musician_profiles(nome_completo, bio, estilos_musicais, portfolio_url, ${PUBLIC_PROFILE})`;

const toPublicProfile = (row: ProfileRow, nameColumn: "nome_completo" | "nome_fantasia"): PublicProfile => ({
  id: row.user_id,
  nome: row[nameColumn] ?? "",
  fotoPerfilUrl: row.foto_perfil_url,
  uf: row.uf,
  cidade: row.cidade,
  avaliacaoMedia: Number(row.avaliacao_media),
  totalAvaliacoes: row.total_avaliacoes,
});

const toValor = (value: number | string | null) => (value === null ? null : Number(value));

const toCandidate = (row: CandidateRow): Candidate => ({
  id: row.id,
  status: row.status,
  valorProposto: toValor(row.valor_proposto),
  musician: {
    ...toPublicProfile(row.musician, "nome_completo"),
    bio: row.musician.bio,
    estilosMusicais: row.musician.estilos_musicais ?? [],
    portfolioUrl: row.musician.portfolio_url,
  },
});

export async function fetchFeed(raioKm: number): Promise<EventItem[]> {
  const matches = unwrap<{ event_id: string; distancia_km: number | null }[]>(await supabase().rpc("musician_feed", { p_raio_km: raioKm }));
  if (matches.length === 0) return [];
  const rows = unwrap<EventRow[]>(await supabase().from("events").select("*").in("id", matches.map((m) => m.event_id)));
  const byId = new Map(rows.map((row) => [row.id, toEvent(row)]));
  return matches.flatMap((m) => {
    const event = byId.get(m.event_id);
    return event ? [{ ...event, distanciaKm: m.distancia_km === null ? undefined : Number(m.distancia_km) }] : [];
  });
}

export async function fetchEvent(id: string): Promise<EventItem> {
  return toEvent(unwrap<EventRow>(await supabase().from("events").select("*").eq("id", id).single()));
}

export async function fetchEventAddress(eventId: string): Promise<string> {
  const { data, error } = await supabase().from("event_locations").select("endereco").eq("event_id", eventId).maybeSingle();
  if (error) unwrap({ data: null, error });
  return data?.endereco ?? "";
}

export async function fetchContractor(id: string): Promise<PublicProfile> {
  const result = await supabase().from("contractor_profiles").select(`nome_fantasia, ${PUBLIC_PROFILE}`).eq("user_id", id).single();
  return toPublicProfile(unwrap<ProfileRow>(result), "nome_fantasia");
}

export async function fetchMyEvents(contractorId: string): Promise<EventItem[]> {
  const result = await supabase().from("events").select("*, event_candidates(count)").eq("contractor_id", contractorId).order("inicio");
  return unwrap<EventRow[]>(result).map(toEvent);
}

export async function fetchMyApplications(musicianId: string): Promise<Application[]> {
  const result = await supabase()
    .from("event_candidates")
    .select("id, status, valor_proposto, event:events(*)")
    .eq("musician_id", musicianId)
    .order("created_at", { ascending: false });
  return unwrap<{ id: string; status: CandidateStatus; valor_proposto: number | string | null; event: EventRow }[]>(result).map((row) => ({
    id: row.id,
    status: row.status,
    valorProposto: toValor(row.valor_proposto),
    event: toEvent(row.event),
  }));
}

export async function fetchMyApplication(eventId: string, musicianId: string): Promise<MyApplication | null> {
  const { data, error } = await supabase()
    .from("event_candidates")
    .select("id, status, valor_proposto")
    .eq("event_id", eventId)
    .eq("musician_id", musicianId)
    .maybeSingle<{ id: string; status: CandidateStatus; valor_proposto: number | string | null }>();
  if (error) unwrap({ data: null, error });
  return data && { id: data.id, status: data.status, valorProposto: toValor(data.valor_proposto) };
}

export async function fetchCandidates(eventId: string): Promise<Candidate[]> {
  const result = await supabase()
    .from("event_candidates")
    .select(CANDIDATE_SELECT)
    .eq("event_id", eventId)
    .order("created_at");
  return unwrap<CandidateRow[]>(result).map(toCandidate);
}

export async function fetchCandidateProfile(eventId: string, candidateId: string): Promise<Candidate | null> {
  const { data, error } = await supabase()
    .from("event_candidates")
    .select(CANDIDATE_SELECT)
    .eq("event_id", eventId)
    .eq("id", candidateId)
    .maybeSingle<CandidateRow>();
  if (error) unwrap({ data: null, error });
  return data?.musician ? toCandidate(data) : null;
}

export async function fetchReviewsOf(userId: string): Promise<Review[]> {
  const result = await supabase().from("reviews").select("id, rating, comment, created_at").eq("reviewed_id", userId).order("created_at", { ascending: false });
  return unwrap<{ id: string; rating: number; comment: string | null; created_at: string }[]>(result).map((row) => ({
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at,
  }));
}

function withImage(dados: EventData, imagem: UploadFile | null): FormData {
  const form = new FormData();
  form.append("dados", JSON.stringify(dados));
  appendFile(form, "imagem", imagem);
  return form;
}

export function createEvent(dados: EventData, imagem: UploadFile): Promise<{ id: string }> {
  return apiRequest("/events", { method: "POST", body: withImage(dados, imagem) });
}

export function updateEvent(id: string, dados: EventData, imagem: UploadFile | null): Promise<{ id: string }> {
  return apiRequest(`/events/${id}`, { method: "PATCH", body: withImage(dados, imagem) });
}

export const deleteEvent = (id: string) => apiRequest(`/events/${id}`, { method: "DELETE" });
export const applyToEvent = (id: string, valorProposto: number | null) =>
  apiRequest(`/events/${id}/candidatura`, { method: "POST", body: { valorProposto } });
export const declineCandidate = (eventId: string, candidateId: string) =>
  apiRequest(`/events/${eventId}/candidatos/${candidateId}/recusa`, { method: "POST" });
export const updateProposal = (id: string, valorProposto: number | null) =>
  apiRequest(`/events/${id}/candidatura`, { method: "PATCH", body: { valorProposto } });
export const cancelApplication = (id: string) => apiRequest(`/events/${id}/candidatura`, { method: "DELETE" });

export const fetchHiring = (id: string) => apiRequest<Hiring>(`/events/${id}/contratacao`);
export type CancellationResult = { situacao: "COBRANCA_CANCELADA" | "ESTORNADO" | "ESTORNO_PROCESSANDO" | "SEM_ESTORNO" };
export const reportNoShow = (id: string) => apiRequest<CancellationResult>(`/events/${id}/nao-comparecimento`, { method: "POST" });
export const cancelHiring = (id: string) => apiRequest<CancellationResult>(`/events/${id}/contratacao`, { method: "DELETE" });
export const cancelPendingCheckout = (id: string) => apiRequest<CancellationResult>(`/events/${id}/checkout`, { method: "DELETE" });

export const confirmCompletion = (id: string) =>
  apiRequest<{ status: EventStatus }>(`/events/${id}/confirmacao`, { method: "POST" });

export const reviewEvent = (id: string, rating: number, comment: string) =>
  apiRequest(`/events/${id}/avaliacao`, { method: "POST", body: { rating, comment: comment.trim() || undefined } });

export const fetchCheckoutStatus = (eventId: string) => apiRequest<Checkout | null>(`/events/${eventId}/checkout`);

const checkoutsInFlight = new Map<string, Promise<Checkout>>();

export function startCheckout(eventId: string, candidateId: string): Promise<Checkout> {
  const key = `${eventId}:${candidateId}`;
  let request = checkoutsInFlight.get(key);
  if (!request) {
    request = apiRequest<Checkout>(`/events/${eventId}/checkout`, { method: "POST", body: { candidateId }, timeoutMs: 60_000 }).finally(() =>
      checkoutsInFlight.delete(key),
    );
    checkoutsInFlight.set(key, request);
  }
  return request;
}

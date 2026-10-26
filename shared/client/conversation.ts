import { apiRequest } from "./api.ts";
import { supabase } from "./config.ts";
import { unwrap, type CandidateStatus, type EventStatus } from "./events.ts";

export interface Message {
  id: string;
  candidateId: string;
  authorId: string;
  texto: string;
  createdAt: string;
}

export interface Conversation {
  candidateId: string;
  status: CandidateStatus;
  valorProposto: number | null;
  event: { id: string; titulo: string; cache: number; status: EventStatus; contractorId: string };
  musician: { id: string; nome: string; fotoPerfilUrl: string | null };
  contractor: { id: string; nome: string; fotoPerfilUrl: string | null };
}

interface MessageRow {
  id: string;
  candidate_id: string;
  author_id: string;
  texto: string;
  created_at: string;
}

interface ConversationRow {
  id: string;
  status: CandidateStatus;
  valor_proposto: number | string | null;
  musician: { user_id: string; nome_completo: string; foto_perfil_url: string | null };
  event: { id: string; titulo: string; cache: number | string; status: EventStatus; contractor_id: string };
}

const toMessage = (row: MessageRow): Message => ({
  id: row.id,
  candidateId: row.candidate_id,
  authorId: row.author_id,
  texto: row.texto,
  createdAt: row.created_at,
});

export async function fetchConversation(candidateId: string): Promise<Conversation> {
  const row = unwrap<ConversationRow>(
    await supabase()
      .from("event_candidates")
      .select("id, status, valor_proposto, musician:musician_profiles(user_id, nome_completo, foto_perfil_url), event:events(id, titulo, cache, status, contractor_id)")
      .eq("id", candidateId)
      .single(),
  );
  const contractor = unwrap<{ user_id: string; nome_fantasia: string; foto_perfil_url: string | null }>(
    await supabase().from("contractor_profiles").select("user_id, nome_fantasia, foto_perfil_url").eq("user_id", row.event.contractor_id).single(),
  );
  return {
    candidateId: row.id,
    status: row.status,
    valorProposto: row.valor_proposto === null ? null : Number(row.valor_proposto),
    event: { id: row.event.id, titulo: row.event.titulo, cache: Number(row.event.cache), status: row.event.status, contractorId: row.event.contractor_id },
    musician: { id: row.musician.user_id, nome: row.musician.nome_completo, fotoPerfilUrl: row.musician.foto_perfil_url },
    contractor: { id: contractor.user_id, nome: contractor.nome_fantasia, fotoPerfilUrl: contractor.foto_perfil_url },
  };
}

export async function fetchMessages(candidateId: string): Promise<Message[]> {
  const result = await supabase().from("candidate_messages").select("*").eq("candidate_id", candidateId).order("created_at");
  return unwrap<MessageRow[]>(result).map(toMessage);
}

export const sendMessage = (candidateId: string, texto: string) =>
  apiRequest<Message>(`/candidaturas/${candidateId}/mensagens`, { method: "POST", body: { texto } });

export function subscribeToMessages(candidateId: string, onMessage: (message: Message) => void): () => void {
  const channel = supabase()
    .channel(`conversa:${candidateId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "candidate_messages", filter: `candidate_id=eq.${candidateId}` }, (payload) => onMessage(toMessage(payload.new as MessageRow)))
    .subscribe();
  return () => void supabase().removeChannel(channel);
}

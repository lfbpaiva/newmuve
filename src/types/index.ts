export type Role = "MUSICIAN" | "CONTRACTOR";

export interface UserBase {
  id: string;
  email: string;
  role: Role;
  uf: string;
  cidade: string;
}

export interface MusicianProfile extends UserBase {
  nomeCompleto: string;
  cpf: string;
  telefone: string;
  fotoPerfilUrl: string;
  bio?: string;
  estilosMusicais: string[];
  avaliacaoMedia: number;
  totalAvaliacoes: number;
}

export interface ContractorProfile extends UserBase {
  nomeFantasia: string;
  cnpj: string;
  telefone: string;
  fotoPerfilUrl: string;
}

export interface Event {
  id: string;
  contractorId: string;
  titulo: string;
  tipoEvento: string;
  cache: number;
  data: string;
  horarioInicio: string;
  duracao: string;
  uf: string;
  cidade: string;
  estiloMusical: string;
  descricao?: string;
  imagemUrl: string;
  status: "ABERTO" | "CONTRATADO" | "CANCELADO" | "CONCLUIDO";
  musicoContratadoId?: string;
  confirmacaoMusico: boolean;
  confirmacaoContratante: boolean;
  candidatos?: EventCandidate[];
}

export type CandidateStatus = "PENDENTE" | "APROVADO" | "RECUSADO";

export interface EventCandidate {
  id: string;
  eventId: string;
  musicianId: string;
  status: CandidateStatus;
  createdAt: string;
}

export interface Review {
  id: string;
  eventId: string;
  authorId: string;
  reviewedId: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

export interface BlockedDocument {
  id: string;
  documento: string;
  tipo: Role;
  blockedAt: string;
}

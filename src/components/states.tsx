import type { ReactNode } from "react";
import type { EventStatus } from "../services/events";
import { Icon } from "./ui";

/** Esqueleto animado no lugar do conteúdo que está sendo carregado. */
export function Loading({ label = "Carregando..." }: { label?: string }) {
  return <div className="skeleton-list" role="status" aria-label={label}>
    {[0, 1, 2].map((i) => <div className="skeleton-card" key={i}><div className="skeleton block"/><div className="skeleton line w60"/><div className="skeleton line w40"/></div>)}
  </div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="empty-state compact" role="alert">
    <h3>Algo deu errado</h3>
    <p>{message}</p>
    <button className="secondary" onClick={onRetry}>Tentar novamente</button>
  </div>;
}

export function EmptyState({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return <div className="empty-state"><span><Icon name={icon} size={34}/></span><h3>{title}</h3>{children}</div>;
}

const statusLabels: Record<EventStatus, string> = {
  ABERTO: "Inscrições abertas",
  CONTRATADO: "Músico contratado",
  CONCLUIDO: "Concluído",
  CANCELADO: "Cancelado",
};

/** Evento aberto cuja data já passou aparece como encerrado, embora o status no banco continue ABERTO. */
export function EventStatusPill({ status, encerrado }: { status: EventStatus; encerrado?: boolean }) {
  if (status === "ABERTO" && encerrado) return <span className="closed">Encerrado sem contratação</span>;
  if (status === "CANCELADO") return <span className="closed">{statusLabels[status]}</span>;
  return <span className={status === "ABERTO" ? "open" : "contracted"}>{statusLabels[status]}</span>;
}

export function Stars({ rating }: { rating: number }) {
  return <span className="stars" role="img" aria-label={`Nota ${rating} de 5`}>
    {[1, 2, 3, 4, 5].map((star) => <span key={star} className={star <= Math.round(rating) ? "on" : "off"}><Icon name="star" size={15}/></span>)}
  </span>;
}

/** Nota média, ou o estado zero "Novo na plataforma" para quem ainda não foi avaliado. */
export function RatingSummary({ media, total }: { media: number; total: number }) {
  if (total === 0) return <span className="rating"><b>Novo na plataforma</b><span>0 avaliações</span></span>;
  return <span className="rating"><Stars rating={media}/><b>{media.toFixed(1).replace(".", ",")}</b><span>{total} {total === 1 ? "avaliação" : "avaliações"}</span></span>;
}

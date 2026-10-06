import { useState } from "react";
import { camposFaltantes, RAIOS_FEED_KM } from "../../../shared/dominio.ts";
import { EmptyState, ErrorState, Loading } from "../../components/states";
import { Icon } from "../../components/ui";
import { useAsync } from "../../hooks/useAsync";
import type { Me } from "../../services/account";
import { fetchFeed } from "../../services/events";
import { formatCurrency, formatDateTime } from "../../utils/format";

const RADIUS_KEY = "muve.feedRadiusKm";

function savedRadius(): number {
  try {
    const value = Number(localStorage.getItem(RADIUS_KEY));
    return (RAIOS_FEED_KM as readonly number[]).includes(value) ? value : 50;
  } catch {
    return 50;
  }
}

const radiusLabel = (km: number) => (km === 0 ? "Só a minha cidade" : `Até ${km} km`);

export default function FeedScreen({ me, onOpen, onProfile, onComplete }: { me: Me; onOpen: (eventId: string) => void; onProfile: () => void; onComplete: () => void }) {
  const [radius, setRadius] = useState(savedRadius);
  const setupPending = camposFaltantes(me, "feed").length > 0;
  const feed = useAsync(`feed:${radius}:${setupPending}`, () => (setupPending ? Promise.resolve([]) : fetchFeed(radius)));

  function changeRadius(km: number) {
    setRadius(km);
    try {
      localStorage.setItem(RADIUS_KEY, String(km));
    } catch {
      // Preferência não persistida: o feed funciona igual.
    }
  }

  return <>
    <header className="topbar">
      <div><h1>Olá, {me.nome}</h1><p className="meta">{me.cidade ? `${me.cidade}, ${me.uf} · ` : ""}{(me.estilosMusicais ?? []).join(", ")}</p></div>
      <button className="avatar image-avatar" onClick={onProfile} aria-label="Abrir meu perfil">{me.fotoPerfilUrl ? <img src={me.fotoPerfilUrl} alt=""/> : <Icon name="user"/>}</button>
    </header>
    <section className="welcome"><div><span className="status-pill">Perfil ativo</span><h2>Encontre o palco que combina com você.</h2><p>As oportunidades são filtradas pelos seus estilos e pela distância da sua cidade.</p></div></section>
    <div className="section-title">
      <h2>Próximos eventos</h2>
      <label className="field inline"><span>Distância</span><select value={radius} onChange={(e) => changeRadius(Number(e.target.value))}>
        {RAIOS_FEED_KM.map((km) => <option key={km} value={km}>{radiusLabel(km)}</option>)}
      </select></label>
    </div>

    {setupPending && <EmptyState icon="pin" title="Monte seu feed"><p>Diga sua cidade e os estilos que você toca. É assim que escolhemos os eventos que aparecem aqui.</p><button className="primary" onClick={onComplete}>Montar meu feed</button></EmptyState>}
    {!setupPending && feed.error && <ErrorState message={feed.error} onRetry={feed.reload}/>}
    {!feed.error && !feed.data && <Loading label="Buscando eventos..."/>}
    {!setupPending && feed.data?.length === 0 && <EmptyState icon="music" title={radius === 0 ? "Nenhum evento na sua cidade para os seus estilos no momento." : `Nenhum evento até ${radius} km para os seus estilos no momento.`}>
      <p>{radius < 200 ? "Experimente aumentar a distância. Novos eventos compatíveis aparecerão aqui automaticamente." : "Novos eventos compatíveis aparecerão aqui automaticamente."}</p>
    </EmptyState>}
    {feed.data && feed.data.length > 0 && <div className="event-grid">{feed.data.map((event) => <article className="event-card" key={event.id}>
      <div className="event-image"><img src={event.imagemUrl} alt=""/><span>{event.tipoEvento}</span><h3>{event.titulo}</h3></div>
      <div className="event-body">
        <div className="tag-list">{event.estilosMusicais.map((estilo) => <span key={estilo}>{estilo}</span>)}{event.formacao !== "Indiferente" && <span>{event.formacao}</span>}{event.somDisponivel && <span>Som no local</span>}</div>
        <p><Icon name="pin" size={15}/> {event.cidade}, {event.uf}{event.distanciaKm ? ` · a ${event.distanciaKm} km` : ""}</p>
        <p><Icon name="calendar" size={15}/> {formatDateTime(event.inicio)}</p>
        <div><span className="price"><small>Cachê</small>{formatCurrency(event.cache)}</span><button className="primary" onClick={() => onOpen(event.id)}>Ver oportunidade</button></div>
      </div>
    </article>)}</div>}
  </>;
}

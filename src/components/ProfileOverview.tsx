import { isValidUrl } from "../../shared/dominio.ts";
import { RatingSummary } from "./states";
import { Icon } from "./ui";

interface ProfileSummary {
  nome: string;
  fotoPerfilUrl: string | null;
  cidade: string | null;
  uf: string | null;
  avaliacaoMedia: number;
  totalAvaliacoes: number;
}

export default function ProfileOverview({ profile, label }: { profile: ProfileSummary; label: string }) {
  return <div className="profile-hero">
    {profile.fotoPerfilUrl ? <img src={profile.fotoPerfilUrl} alt={`Foto de ${profile.nome}`}/> : <div className="avatar-placeholder"><Icon name="user" size={48}/></div>}
    <div>
      <span className="available">{label}</span>
      <h1>{profile.nome}</h1>
      <p>{profile.cidade && profile.uf ? `${profile.cidade}, ${profile.uf}` : "Cidade não informada"}</p>
      <div className="big-rating"><RatingSummary media={profile.avaliacaoMedia} total={profile.totalAvaliacoes}/></div>
    </div>
  </div>;
}

export function MusicianPublicFields({ profile }: { profile: { bio?: string | null; estilosMusicais?: readonly string[] | null; portfolioUrl?: string | null } }) {
  return <>
    <h3>Apresentação</h3>
    {profile.bio ? <p>{profile.bio}</p> : <p className="muted">Descrição não informada.</p>}
    {Boolean(profile.estilosMusicais?.length) && <><h3>Estilos musicais</h3><div className="tag-list">{profile.estilosMusicais?.map((estilo) => <span key={estilo}>{estilo}</span>)}</div></>}
    {profile.portfolioUrl && isValidUrl(profile.portfolioUrl) && <><h3>Portfólio</h3><p><a href={profile.portfolioUrl} target="_blank" rel="noopener noreferrer">Ver trabalho do músico <Icon name="external" size={14}/></a></p></>}
  </>;
}

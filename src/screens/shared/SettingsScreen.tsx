import { Icon, Secondary } from "../../components/ui";
import type { Me } from "../../services/account";

interface Props {
  me: Me;
  onBack: () => void;
  onEditProfile: () => void;
  onDeleteAccount: () => void;
  onLogout: () => void;
}

export default function SettingsScreen({ me, onBack, onEditProfile, onDeleteAccount, onLogout }: Props) {
  return <Secondary title="Configurações" subtitle="Gerencie sua conta e preferências." onBack={onBack}>
    <div className="settings-list">
      <button onClick={onEditProfile}><span><Icon name="user"/><i><b>Editar perfil</b><small>Nome, foto, telefone e localização{me.cidade ? ` (${me.cidade}, ${me.uf})` : ""}</small></i></span><Icon name="chevron"/></button>
      {me.role === "MUSICIAN" && <button onClick={onEditProfile}><span><Icon name="music"/><i><b>Preferências musicais</b><small>{(me.estilosMusicais ?? []).join(", ")}</small></i></span><Icon name="chevron"/></button>}
      <button className="danger-row" onClick={onDeleteAccount}><span><Icon name="logout"/><i><b>Excluir conta</b><small>Ação permanente</small></i></span><Icon name="chevron"/></button>
      <button onClick={onLogout}><span><Icon name="logout"/><i><b>Sair da conta</b><small>Encerrar esta sessão</small></i></span><Icon name="chevron"/></button>
    </div>
  </Secondary>;
}

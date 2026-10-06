import { useState } from "react";
import { camposFaltantes, descreverFaltantes, ESTILOS_MUSICAIS, imageProblem, isValidChavePix, isValidDocumento, isValidTelefone, isValidUrl, type AcaoPerfil } from "../../../shared/dominio.ts";
import { useAuth } from "../../auth/AuthContext";
import LocationSelector from "../../components/LocationSelector";
import PixKeyFields from "../../components/PixKeyFields";
import { Field, Secondary, UploadField } from "../../components/ui";
import { updateProfile, type Me } from "../../services/account";
import { errorMessage } from "../../services/api";
import { maskDocumento, maskPhone } from "../../utils/validators";

/** "acao": quando a tela é aberta para completar o que falta antes de uma ação. */
export default function EditProfileScreen({ me, onDone, acao }: { me: Me; onDone: () => void; acao?: AcaoPerfil }) {
  const { refreshMe } = useAuth();
  const isMusician = me.role === "MUSICIAN";
  // Rascunho local: nada é alterado na conta até "Salvar alterações".
  const faltando = acao ? camposFaltantes(me, acao) : [];
  const [form, setForm] = useState({
    nome: me.nome,
    documento: maskDocumento(me.documento ?? ""),
    telefone: maskPhone(me.telefone ?? ""),
    uf: me.uf ?? "",
    cidade: me.cidade ?? "",
    bio: me.bio ?? "",
    chavePixTipo: me.chavePixTipo ?? "",
    chavePix: me.chavePix ?? "",
    portfolioUrl: me.portfolioUrl ?? "",
  });
  const [estilos, setEstilos] = useState<string[]>(me.estilosMusicais ?? []);
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(me.fotoPerfilUrl ?? "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function set(changes: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...changes }));
    setError("");
  }

  async function save() {
    if (!form.nome.trim()) return setError("Informe seu nome.");
    if (form.documento && !isValidDocumento(form.documento)) return setError("Informe um CPF ou CNPJ válido.");
    if (form.telefone && !isValidTelefone(form.telefone)) return setError("Informe um telefone completo.");
    if (form.uf && !form.cidade) return setError("Selecione a cidade.");
    if (isMusician && form.chavePix && !isValidChavePix(form.chavePixTipo, form.chavePix)) return setError("Chave Pix inválida para o tipo selecionado.");
    if (isMusician && form.portfolioUrl && !isValidUrl(form.portfolioUrl)) return setError("Informe um link válido, começando com http:// ou https://.");

    setSubmitting(true);
    try {
      const { bio, chavePixTipo, chavePix, portfolioUrl, ...comum } = form;
      await updateProfile(isMusician ? { ...comum, bio, estilosMusicais: estilos, chavePixTipo, chavePix, portfolioUrl } : comum, avatar);
      await refreshMe();
      onDone();
    } catch (e) {
      setError(errorMessage(e));
      setSubmitting(false);
    }
  }

  return <Secondary title={acao ? "Complete seu perfil" : "Editar perfil"} subtitle={acao ? "Só o necessário para continuar." : "Atualize os dados da sua conta."} onBack={onDone}>
    <div className="form-card">
      {faltando.length > 0 && <p className="notice">Para {acao === "feed" ? "montar seu feed" : acao === "candidatar" ? "se inscrever em eventos" : acao === "criarEvento" ? "publicar um evento" : "aprovar um candidato"}, falta: <b>{descreverFaltantes(faltando)}</b>.</p>}
      <UploadField
        label="Alterar foto do perfil"
        preview={avatarPreview}
        onFile={(file) => {
          const problem = imageProblem(file);
          if (problem) return setError(problem);
          setAvatar(file);
          setAvatarPreview(URL.createObjectURL(file));
          setError("");
        }}
      />
      <div className="grid-2">
        <Field label={isMusician ? "Nome completo ou nome da banda" : "Nome ou nome fantasia"} value={form.nome} onChange={(nome) => set({ nome })}/>
        <Field label="Telefone" value={form.telefone} onChange={(value) => set({ telefone: maskPhone(value) })}/>
        <Field label="CPF ou CNPJ" placeholder="000.000.000-00" value={form.documento} onChange={(value) => set({ documento: maskDocumento(value) })}/>
        <LocationSelector uf={form.uf} city={form.cidade} onUfChange={(uf) => set({ uf, cidade: "" })} onCityChange={(cidade) => set({ cidade })} onError={setError}/>
        {isMusician && <PixKeyFields tipo={form.chavePixTipo} chave={form.chavePix} onTipoChange={(chavePixTipo) => set({ chavePixTipo })} onChaveChange={(chavePix) => set({ chavePix })}/>}
      </div>
      {isMusician && <>
        <Field label="Link do seu trabalho (opcional)" placeholder="https://youtube.com/... ou instagram.com/..." value={form.portfolioUrl} onChange={(portfolioUrl) => set({ portfolioUrl })}/>
        <label className="field"><span>Bio</span><textarea value={form.bio} maxLength={1000} onChange={(e) => set({ bio: e.target.value })}/></label>
        <div className="styles"><span>Estilos musicais</span><div>{ESTILOS_MUSICAIS.map((estilo) => {
          const selected = estilos.includes(estilo);
          return <button type="button" key={estilo} aria-pressed={selected} className={selected ? "selected" : ""} onClick={() => { setEstilos((old) => selected ? old.filter((x) => x !== estilo) : [...old, estilo]); setError(""); }}>{estilo}{selected && " ×"}</button>;
        })}</div></div>
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button className="secondary" disabled={submitting} onClick={onDone}>Cancelar</button>
        <button className="primary" disabled={submitting} onClick={save}>{submitting ? "Salvando..." : "Salvar alterações"}</button>
      </div>
    </div>
  </Secondary>;
}

import { useState } from "react";
import { ESTILOS_EVENTO, FORMACOES, imageProblem, isValidCache, QUALQUER_ESTILO, TIPOS_EVENTO } from "../../../shared/dominio.ts";
import LocationSelector from "../../components/LocationSelector";
import { ErrorState, Loading } from "../../components/states";
import { Field, Secondary, UploadField } from "../../components/ui";
import { useAsync } from "../../hooks/useAsync";
import { errorMessage } from "../../services/api";
import { createEvent, fetchEvent, fetchEventAddress, updateEvent, type EventItem } from "../../services/events";
import { formatCurrency } from "../../utils/format";
import { calcularCobranca } from "../../../shared/dominio.ts";
import { minutesToTimeInput, timeInputToMinutes, toDateInput, toTimeInput } from "../../utils/format";

interface Props {
  /** Ausente ao criar; presente ao editar. */
  eventId?: string;
  onBack: () => void;
  onSaved: (eventId: string) => void;
}

export default function EventFormScreen({ eventId, onBack, onSaved }: Props) {
  const existing = useAsync(`event-form:${eventId ?? "new"}`, async () => {
    if (!eventId) return null;
    const [event, endereco] = await Promise.all([fetchEvent(eventId), fetchEventAddress(eventId)]);
    return { ...event, endereco };
  });
  const title = eventId ? "Editar evento" : "Criar novo evento";

  if (existing.error) return <Secondary title={title} subtitle="" onBack={onBack}><ErrorState message={existing.error} onRetry={existing.reload}/></Secondary>;
  if (existing.data === undefined) return <Secondary title={title} subtitle="" onBack={onBack}><Loading/></Secondary>;
  return <EventForm event={existing.data} title={title} onBack={onBack} onSaved={onSaved}/>;
}

type EditableEvent = EventItem & { endereco: string };

function initialForm(event: EditableEvent | null) {
  const inicio = event ? new Date(event.inicio) : null;
  return {
    titulo: event?.titulo ?? "",
    tipoEvento: event?.tipoEvento ?? "",
    data: inicio ? toDateInput(inicio) : "",
    horario: inicio ? toTimeInput(inicio) : "",
    duracao: event ? minutesToTimeInput(event.duracaoMinutos) : "",
    cache: event ? String(event.cache).replace(".", ",") : "",
    uf: event?.uf ?? "",
    cidade: event?.cidade ?? "",
    endereco: event?.endereco ?? "",
    estilosMusicais: event?.estilosMusicais ?? [],
    formacao: event?.formacao ?? "Indiferente",
    somDisponivel: event?.somDisponivel ?? false,
    descricao: event?.descricao ?? "",
  };
}

function EventForm({ event, title, onBack, onSaved }: { event: EditableEvent | null; title: string; onBack: () => void; onSaved: (id: string) => void }) {
  const [form, setForm] = useState(() => initialForm(event));
  const [imagem, setImagem] = useState<File | null>(null);
  const [preview, setPreview] = useState(event?.imagemUrl ?? "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function set(changes: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...changes }));
    setError("");
  }

  async function submit() {
    const cache = Number(form.cache.replace(/\./g, "").replace(",", "."));
    const inicio = new Date(`${form.data}T${form.horario}`);

    if (!form.titulo.trim()) return setError("Informe o título do evento.");
    if (!form.tipoEvento || !form.data || !form.horario || !form.duracao) return setError("Informe tipo, data, horário de início e duração do evento.");
    if (Number.isNaN(inicio.getTime())) return setError("Data ou horário inválido.");
    if (inicio <= new Date()) return setError(form.data === toDateInput(new Date()) ? "O horário de início não pode ser inferior ao horário atual." : "Escolha a data de hoje ou uma data futura.");
    if (timeInputToMinutes(form.duracao) < 1) return setError("Informe a duração do evento.");
    if (!isValidCache(cache)) return setError("O cachê mínimo é de R$ 100,00.");
    if (!form.uf || !form.cidade) return setError("Selecione o estado e a cidade do evento.");
    if (form.endereco.trim().length < 5) return setError("Informe o endereço do evento.");
    if (form.estilosMusicais.length === 0) return setError("Selecione ao menos um estilo musical, ou \"Qualquer estilo\".");
    if (!event && !imagem) return setError("Adicione uma foto ilustrativa do evento.");

    const dados = {
      titulo: form.titulo,
      tipoEvento: form.tipoEvento,
      inicio: inicio.toISOString(),
      duracaoMinutos: timeInputToMinutes(form.duracao),
      uf: form.uf,
      cidade: form.cidade,
      endereco: form.endereco.trim(),
      estilosMusicais: form.estilosMusicais,
      formacao: form.formacao,
      somDisponivel: form.somDisponivel,
      cache,
      descricao: form.descricao,
    };

    setSubmitting(true);
    try {
      const saved = event ? await updateEvent(event.id, dados, imagem) : await createEvent(dados, imagem!);
      onSaved(saved.id);
    } catch (e) {
      setError(errorMessage(e));
      setSubmitting(false);
    }
  }

  return <Secondary title={title} subtitle="Preencha os detalhes para encontrar o músico ideal." onBack={onBack}>
    <div className="form-card">
      <div className="form-section"><b>01</b><div><h3>Sobre o evento</h3><p>Informações principais da oportunidade.</p></div></div>
      <div className="grid-2">
        <div className="span-2"><Field label="Título do evento" placeholder="Ex: Noite acústica no terraço" value={form.titulo} onChange={(titulo) => set({ titulo })}/></div>
        <label className="field"><span>Tipo de evento</span><select value={form.tipoEvento} onChange={(e) => set({ tipoEvento: e.target.value })}><option value="">Selecione</option>{TIPOS_EVENTO.map((tipo) => <option key={tipo}>{tipo}</option>)}</select></label>
        <Field label="Data" type="date" value={form.data} onChange={(data) => set({ data })} min={toDateInput(new Date())}/>
        <Field label="Horário de início" type="time" value={form.horario} onChange={(horario) => set({ horario })}/>
        <Field label="Duração estimada (HH:mm)" type="time" value={form.duracao} onChange={(duracao) => set({ duracao })}/>
      </div>
      <div className="form-section"><b>02</b><div><h3>Local e cachê</h3><p>Onde será o show e qual o investimento.</p></div></div>
      <div className="grid-2">
        <LocationSelector uf={form.uf} city={form.cidade} onUfChange={(uf) => set({ uf, cidade: "" })} onCityChange={(cidade) => set({ cidade })} onError={setError}/>
        <div className="span-2"><Field label="Endereço do evento" placeholder="Rua, número, bairro e ponto de referência" value={form.endereco} onChange={(endereco) => set({ endereco })}/><small className="muted">Visível apenas para o músico contratado.</small></div>
        <div className="styles span-2"><span>Estilos musicais</span><small className="muted">Marque um ou mais; "Qualquer estilo" abre o evento para todos os músicos.</small><div>{ESTILOS_EVENTO.map((estilo) => {
          const selected = form.estilosMusicais.includes(estilo);
          return <button type="button" key={estilo} aria-pressed={selected} className={selected ? "selected" : ""} onClick={() => set({ estilosMusicais: estilo === QUALQUER_ESTILO ? (selected ? [] : [QUALQUER_ESTILO]) : selected ? form.estilosMusicais.filter((x) => x !== estilo) : [...form.estilosMusicais.filter((x) => x !== QUALQUER_ESTILO), estilo] })}>{estilo}{selected && " ×"}</button>;
        })}</div></div>
        <label className="field"><span>Formação desejada</span><select value={form.formacao} onChange={(e) => set({ formacao: e.target.value })}>{FORMACOES.map((f) => <option key={f}>{f}</option>)}</select></label>
        <label className="check span-2 structure"><input type="checkbox" checked={form.somDisponivel} onChange={(e) => set({ somDisponivel: e.target.checked })}/> O local oferece equipamento de som (caixas, mesa e microfones)</label>
        <div><Field label="Cachê oferecido (R$)" placeholder="100,00 ou mais" value={form.cache} onChange={(value) => set({ cache: value.replace(/[^\d.,]/g, "") })}/>{Number(form.cache.replace(",", ".")) >= 100 && <small className="muted">Com a taxa de serviço de 10%, você pagará {formatCurrency(calcularCobranca(Number(form.cache.replace(",", "."))).total)}.</small>}</div>
      </div>
      <UploadField
        label={event ? "Trocar foto ilustrativa" : "Foto ilustrativa obrigatória"}
        preview={preview}
        onFile={(file) => {
          const problem = imageProblem(file);
          if (problem) return setError(problem);
          setImagem(file);
          setPreview(URL.createObjectURL(file));
          setError("");
        }}
      />
      <label className="field"><span>Descrição e observações</span><textarea value={form.descricao} maxLength={2000} onChange={(e) => set({ descricao: e.target.value })} placeholder="Conte um pouco sobre o evento, repertório esperado e estrutura disponível..."/></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button className="secondary" disabled={submitting} onClick={onBack}>Cancelar</button>
        <button className="primary" disabled={submitting} onClick={submit}>{submitting ? "Salvando..." : event ? "Salvar alterações" : "Publicar evento"}</button>
      </div>
    </div>
  </Secondary>;
}

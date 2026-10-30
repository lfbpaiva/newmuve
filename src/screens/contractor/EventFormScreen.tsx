import { useEffect, useRef, useState } from "react";
import { ESTILOS_EVENTO, FORMACOES, imageProblem, isValidCache, QUALQUER_ESTILO, TIPOS_EVENTO } from "../../../shared/dominio.ts";
import LocationSelector from "../../components/LocationSelector";
import { ErrorState, Loading } from "../../components/states";
import { Field, Icon, Secondary, UploadField } from "../../components/ui";
import { useAsync } from "../../hooks/useAsync";
import { errorMessage } from "../../services/api";
import { cepDigits, CepLookupError, formatCep, formatEventAddress, lookupCep, type CepAddress } from "../../services/cep";
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
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
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
  const [cepTouched, setCepTouched] = useState(false);
  const [cepStatus, setCepStatus] = useState("");
  const lookupVersion = useRef(0);
  const manualAddressRevision = useRef(0);
  const activeLookup = useRef<AbortController | null>(null);
  const cepCache = useRef(new Map<string, CepAddress | CepLookupError>());
  const lastAppliedAddress = useRef<{ digits: string; address: CepAddress } | null>(null);

  function set(changes: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...changes }));
    setError("");
  }

  function setAddress(changes: Partial<typeof form>) {
    manualAddressRevision.current += 1;
    set(changes);
  }

  function setCep(value: string) {
    lookupVersion.current += 1;
    activeLookup.current?.abort();
    setCepStatus("");
    const nextCep = formatCep(value);
    const previous = lastAppliedAddress.current;
    setForm((current) => ({
      ...current,
      cep: nextCep,
      ...(previous && cepDigits(nextCep) !== previous.digits ? {
        logradouro: current.logradouro === previous.address.logradouro ? "" : current.logradouro,
        bairro: current.bairro === previous.address.bairro ? "" : current.bairro,
        cidade: current.cidade === previous.address.cidade ? "" : current.cidade,
        uf: current.uf === previous.address.uf ? "" : current.uf,
      } : {}),
    }));
    if (previous && cepDigits(nextCep) !== previous.digits) lastAppliedAddress.current = null;
    setError("");
  }

  useEffect(() => {
    if (event || cepDigits(form.cep).length !== 8) return;
    const digits = cepDigits(form.cep);
    const version = lookupVersion.current;
    const revision = manualAddressRevision.current;
    const cached = cepCache.current.get(digits);
    const controller = new AbortController();
    activeLookup.current = controller;

    function apply(address: CepAddress) {
      if (controller.signal.aborted || version !== lookupVersion.current) return;
      if (revision === manualAddressRevision.current) {
        setForm((current) => ({ ...current, logradouro: address.logradouro, bairro: address.bairro, cidade: address.cidade, uf: address.uf }));
        lastAppliedAddress.current = { digits, address };
        setCepStatus(address.logradouro ? "Endereço encontrado. Confira os dados e informe o número." : "CEP encontrado. Informe o logradouro e o número manualmente.");
      } else {
        setCepStatus("CEP localizado. Os dados digitados durante a consulta foram mantidos; confira o endereço.");
      }
    }

    if (cached instanceof CepLookupError) {
      setCepStatus(cached.message);
      return () => controller.abort();
    }
    if (cached) {
      apply(cached);
      return () => controller.abort();
    }

    const timer = setTimeout(() => {
      setCepStatus("Consultando CEP...");
      lookupCep(digits, controller.signal).then((address) => {
        if (controller.signal.aborted || version !== lookupVersion.current) return;
        cepCache.current.set(digits, address);
        apply(address);
      }).catch((lookupError: unknown) => {
        if (controller.signal.aborted || version !== lookupVersion.current) return;
        const problem = lookupError instanceof CepLookupError ? lookupError : new CepLookupError("unavailable");
        if (problem.code === "not-found") cepCache.current.set(digits, problem);
        setCepStatus(problem.message);
      });
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
      if (activeLookup.current === controller) activeLookup.current = null;
    };
  }, [form.cep, event]);

  async function submit() {
    if (submitting) return;
    const cache = Number(form.cache.replace(/\./g, "").replace(",", "."));
    const inicio = new Date(`${form.data}T${form.horario}`);
    const endereco = event ? form.endereco.trim() : formatEventAddress(form);

    if (!form.titulo.trim()) return setError("Informe o título do evento.");
    if (!form.tipoEvento || !form.data || !form.horario || !form.duracao) return setError("Informe tipo, data, horário de início e duração do evento.");
    if (Number.isNaN(inicio.getTime())) return setError("Data ou horário inválido.");
    if (inicio <= new Date()) return setError(form.data === toDateInput(new Date()) ? "O horário de início não pode ser inferior ao horário atual." : "Escolha a data de hoje ou uma data futura.");
    if (timeInputToMinutes(form.duracao) < 1) return setError("Informe a duração do evento.");
    if (!isValidCache(cache)) return setError("O cachê mínimo é de R$ 100,00.");
    if (!form.uf || !form.cidade) return setError("Selecione o estado e a cidade do evento.");
    if (!event && form.cep && cepDigits(form.cep).length !== 8) return setError("Informe um CEP com 8 números ou deixe o campo vazio para preencher manualmente.");
    if (!event && !form.logradouro.trim()) return setError("Informe o logradouro do evento.");
    if (endereco.length < 5) return setError("Informe o endereço do evento.");
    if (endereco.length > 200) return setError("O endereço deve ter no máximo 200 caracteres.");
    if (form.estilosMusicais.length === 0) return setError("Selecione ao menos um estilo musical, ou \"Qualquer estilo\".");
    if (!event && !imagem) return setError("Adicione uma foto ilustrativa do evento.");

    const dados = {
      titulo: form.titulo,
      tipoEvento: form.tipoEvento,
      inicio: inicio.toISOString(),
      duracaoMinutos: timeInputToMinutes(form.duracao),
      uf: form.uf,
      cidade: form.cidade,
      endereco,
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
      <div className="form-section"><h3>Sobre o evento</h3><p>Informações principais da oportunidade.</p></div>
      <div className="grid-2">
        <div className="span-2"><Field label="Título do evento" placeholder="Ex: Noite acústica no terraço" value={form.titulo} onChange={(titulo) => set({ titulo })}/></div>
        <label className="field"><span>Tipo de evento</span><select value={form.tipoEvento} onChange={(e) => set({ tipoEvento: e.target.value })}><option value="">Selecione</option>{TIPOS_EVENTO.map((tipo) => <option key={tipo}>{tipo}</option>)}</select></label>
        <Field label="Data" type="date" value={form.data} onChange={(data) => set({ data })} min={toDateInput(new Date())}/>
        <Field label="Horário de início" type="time" value={form.horario} onChange={(horario) => set({ horario })}/>
        <Field label="Duração estimada (HH:mm)" type="time" value={form.duracao} onChange={(duracao) => set({ duracao })}/>
      </div>
      <div className="form-section"><h3>Local e cachê</h3><p>Onde será o show e qual o investimento.</p></div>
      <div className="grid-2">
        {!event && <div className="span-2">
          <label className="field"><span>CEP</span><input inputMode="numeric" autoComplete="postal-code" maxLength={9} placeholder="00000-000" value={form.cep} onChange={(e) => setCep(e.target.value)} onBlur={() => setCepTouched(true)}/></label>
          {cepStatus ? <small className="muted" role="status">{cepStatus}</small> : cepTouched && form.cep && cepDigits(form.cep).length !== 8 ? <small className="muted" role="status">Informe um CEP com 8 números ou deixe em branco para preencher manualmente.</small> : null}
        </div>}
        <LocationSelector uf={form.uf} city={form.cidade} onUfChange={(uf) => setAddress({ uf, cidade: "" })} onCityChange={(cidade) => setAddress({ cidade })} onError={setError} manualCityFallback={!event}/>
        {event ? <div className="span-2"><Field label="Endereço do evento" placeholder="Rua, número, bairro e ponto de referência" value={form.endereco} onChange={(endereco) => set({ endereco })}/><small className="muted">Visível apenas para o músico contratado.</small></div> : <>
          <div className="span-2"><Field label="Logradouro" placeholder="Rua, avenida ou praça" value={form.logradouro} onChange={(logradouro) => setAddress({ logradouro })}/></div>
          <Field label="Número" placeholder="Número ou s/n" value={form.numero} onChange={(numero) => setAddress({ numero })}/>
          <Field label="Complemento" placeholder="Apartamento, sala ou referência" value={form.complemento} onChange={(complemento) => setAddress({ complemento })}/>
          <div className="span-2"><Field label="Bairro" placeholder="Bairro" value={form.bairro} onChange={(bairro) => setAddress({ bairro })}/><small className="muted">Endereço visível apenas para o músico contratado.</small></div>
        </>}
        <div className="styles span-2"><span>Estilos musicais</span><small className="muted">Marque um ou mais; "Qualquer estilo" abre o evento para todos os músicos.</small><div>{ESTILOS_EVENTO.map((estilo) => {
          const selected = form.estilosMusicais.includes(estilo);
          return <button type="button" key={estilo} aria-pressed={selected} className={selected ? "selected" : ""} onClick={() => set({ estilosMusicais: estilo === QUALQUER_ESTILO ? (selected ? [] : [QUALQUER_ESTILO]) : selected ? form.estilosMusicais.filter((x) => x !== estilo) : [...form.estilosMusicais.filter((x) => x !== QUALQUER_ESTILO), estilo] })}>{selected && <Icon name="check" size={13}/>}{estilo}</button>;
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

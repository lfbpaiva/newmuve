import { useState } from "react";
import { View } from "react-native";
import { errorMessage } from "../../shared/client/api.ts";
import type { UploadFile } from "../../shared/client/config.ts";
import { createEvent, updateEvent, type EventItem } from "../../shared/client/events.ts";
import { formatCurrency, minutesToTimeInput, timeInputToMinutes, toDateInput, toTimeInput } from "../../shared/client/format.ts";
import { calcularCobranca, ESTILOS_EVENTO, FORMACOES, isValidCache, QUALQUER_ESTILO, TIPOS_EVENTO } from "../../shared/dominio.ts";
import { space } from "../lib/theme";
import { ImageField, LocationFields } from "./fields";
import { Alert, Button, Checkbox, Chips, Field, Section, Select } from "./ui";

type EditableEvent = EventItem & { endereco: string };

/** "DD/MM/AAAA" ↔ "AAAA-MM-DD"; a data é digitada, sem seletor nativo. */
const maskDate = (v: string) => v.replace(/\D/g, "").slice(0, 8).replace(/(\d{2})(\d)/, "$1/$2").replace(/(\d{2})\/(\d{2})(\d)/, "$1/$2/$3");
const maskTime = (v: string) => v.replace(/\D/g, "").slice(0, 4).replace(/(\d{2})(\d)/, "$1:$2");
const toIsoDate = (br: string) => br.split("/").reverse().join("-");
const fromIsoDate = (iso: string) => iso.split("-").reverse().join("/");

function initialForm(event: EditableEvent | null) {
  const inicio = event ? new Date(event.inicio) : null;
  return {
    titulo: event?.titulo ?? "",
    tipoEvento: event?.tipoEvento ?? "",
    data: inicio ? fromIsoDate(toDateInput(inicio)) : "",
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

export default function EventForm({ event, onSaved }: { event: EditableEvent | null; onSaved: (id: string) => void }) {
  const [form, setForm] = useState(() => initialForm(event));
  const [imagem, setImagem] = useState<UploadFile | null>(null);
  const [preview, setPreview] = useState(event?.imagemUrl ?? "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const set = (changes: Partial<typeof form>) => { setForm((c) => ({ ...c, ...changes })); setError(""); };
  const cacheNumber = Number(form.cache.replace(/\./g, "").replace(",", "."));

  async function submit() {
    const inicio = new Date(`${toIsoDate(form.data)}T${form.horario}`);
    if (!form.titulo.trim()) return setError("Informe o título do evento.");
    if (!form.tipoEvento || form.data.length !== 10 || form.horario.length !== 5 || form.duracao.length !== 5) return setError("Informe tipo, data, horário de início e duração do evento.");
    if (Number.isNaN(inicio.getTime())) return setError("Data ou horário inválido.");
    if (inicio <= new Date()) return setError("O horário de início não pode ser inferior ao horário atual.");
    if (timeInputToMinutes(form.duracao) < 1) return setError("Informe a duração do evento.");
    if (!isValidCache(cacheNumber)) return setError("O cachê mínimo é de R$ 100,00.");
    if (!form.uf || !form.cidade) return setError("Selecione o estado e a cidade do evento.");
    if (form.endereco.trim().length < 5) return setError("Informe o endereço do evento.");
    if (form.estilosMusicais.length === 0) return setError("Selecione ao menos um estilo musical, ou \"Qualquer estilo\".");
    if (!event && !imagem) return setError("Adicione uma foto do evento.");

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
      cache: cacheNumber,
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

  const options = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

  return <>
    <ImageField shape="banner" label={event ? "Trocar foto do evento" : "Foto do evento"} preview={preview} onPick={(file, uri) => { setImagem(file); setPreview(uri); setError(""); }} onError={setError}/>
    <Section title="O evento">
      <Field label="Título" value={form.titulo} onChangeText={(titulo) => set({ titulo })} placeholder="Ex: Noite acústica no terraço"/>
      <Select label="Tipo de evento" value={form.tipoEvento} options={options(TIPOS_EVENTO)} onChange={(tipoEvento) => set({ tipoEvento })}/>
      <View style={{ flexDirection: "row", gap: space.md }}>
        <View style={{ flex: 1.3 }}><Field label="Data" value={form.data} onChangeText={(v) => set({ data: maskDate(v) })} keyboardType="numeric" placeholder="DD/MM/AAAA"/></View>
        <View style={{ flex: 1 }}><Field label="Início" value={form.horario} onChangeText={(v) => set({ horario: maskTime(v) })} keyboardType="numeric" placeholder="HH:MM"/></View>
        <View style={{ flex: 1 }}><Field label="Duração" value={form.duracao} onChangeText={(v) => set({ duracao: maskTime(v) })} keyboardType="numeric" placeholder="HH:MM"/></View>
      </View>
      <Field label="Descrição" value={form.descricao} onChangeText={(descricao) => set({ descricao })} multiline maxLength={2000} placeholder="Repertório esperado, público, estrutura disponível..."/>
    </Section>
    <Section title="Onde">
      <LocationFields uf={form.uf} cidade={form.cidade} onUfChange={(uf) => set({ uf, cidade: "" })} onCidadeChange={(cidade) => set({ cidade })} onError={setError}/>
      <Field label="Endereço" value={form.endereco} onChangeText={(endereco) => set({ endereco })} placeholder="Rua, número, bairro e referência" hint="Visível apenas para o músico contratado."/>
    </Section>
    <Section title="Quem você procura">
      <Chips options={ESTILOS_EVENTO} selected={form.estilosMusicais} onToggle={(estilo) => {
        const selected = form.estilosMusicais.includes(estilo);
        // "Qualquer estilo" é exclusivo: marca-lo limpa os demais, e vice-versa.
        set({ estilosMusicais: estilo === QUALQUER_ESTILO ? (selected ? [] : [QUALQUER_ESTILO]) : selected ? form.estilosMusicais.filter((x) => x !== estilo) : [...form.estilosMusicais.filter((x) => x !== QUALQUER_ESTILO), estilo] });
      }}/>
      <Select label="Formação" value={form.formacao} options={options(FORMACOES)} onChange={(formacao) => set({ formacao })}/>
      <Checkbox label="O local oferece equipamento de som (caixas, mesa e microfones)" checked={form.somDisponivel} onChange={(somDisponivel) => set({ somDisponivel })}/>
    </Section>
    <Section title="Cachê">
      <Field label="Valor oferecido (R$)" value={form.cache} onChangeText={(v) => set({ cache: v.replace(/[^\d.,]/g, "") })} keyboardType="decimal-pad" placeholder="100,00 ou mais" hint={cacheNumber >= 100 ? `Com a taxa de serviço de 10%, você pagará ${formatCurrency(calcularCobranca(cacheNumber).total)}. O músico recebe ${formatCurrency(cacheNumber)}.` : "Mínimo de R$ 100,00. A taxa de serviço de 10% é somada ao cachê."}/>
    </Section>
    {error ? <Alert tone="error">{error}</Alert> : null}
    <Button title={event ? "Salvar alterações" : "Publicar evento"} icon={event ? "save-outline" : "megaphone-outline"} onPress={submit} loading={submitting}/>
  </>;
}

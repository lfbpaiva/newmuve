import { useEffect, useState } from "react";

const states = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

interface Props {
  uf: string;
  city: string;
  onUfChange: (uf: string) => void;
  onCityChange: (city: string) => void;
  onError?: (msg: string) => void;
}

export default function LocationSelector({ uf, city, onUfChange, onCityChange, onError }: Props) {
  const [loaded, setLoaded] = useState<{ uf: string; cities: string[] }>({ uf: "", cities: [] });
  const loading = Boolean(uf) && loaded.uf !== uf;
  const cities = loaded.uf === uf ? loaded.cities : [];

  useEffect(() => {
    if (!uf) return;
    const controller = new AbortController();
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("IBGE request failed");
        return response.json();
      })
      .then((data: { nome: string }[]) => setLoaded({ uf, cities: data.map((c) => c.nome) }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoaded({ uf, cities: [] });
        onError?.("Não foi possível carregar as cidades do IBGE.");
      });
    return () => controller.abort();
  }, [uf, onError]);

  return <>
    <label className="field">
      <span>Estado (UF)</span>
      <select value={uf} onChange={(e) => { onUfChange(e.target.value); onCityChange(""); }}>
        <option value="">Selecione</option>
        {states.map((s) => <option key={s}>{s}</option>)}
      </select>
    </label>
    <label className="field">
      <span>Cidade</span>
      <select value={city} disabled={!uf || loading || !cities.length} onChange={(e) => onCityChange(e.target.value)}>
        <option value="">{loading ? "Carregando..." : uf ? "Selecione a cidade" : "Selecione o estado primeiro"}</option>
        {cities.map((c) => <option key={c}>{c}</option>)}
      </select>
    </label>
  </>;
}

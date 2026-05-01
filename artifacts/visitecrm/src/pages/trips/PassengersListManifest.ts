import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { BoardingPassenger } from "@workspace/api-client-react";

export interface ManifestPanel {
  tripName?: string | null;
  departureDate?: string | null;
  tenantName?: string | null;
  tenantCnpj?: string | null;
  manifestNumber?: string | null;
  vehiclePlate?: string | null;
  vehicleType?: string | null;
  driverName?: string | null;
  driver1Cpf?: string | null;
  driver1Cnh?: string | null;
  driver1CnhCategory?: string | null;
  driver1CnhExpiry?: string | null;
  driver2Name?: string | null;
  driver2Cpf?: string | null;
  driver2Cnh?: string | null;
  driver2CnhCategory?: string | null;
  driver2CnhExpiry?: string | null;
  tourGuide?: string | null;
  tourGuideCpf?: string | null;
  tourGuideRegistration?: string | null;
}

export interface ManifestTrip {
  destinationCity?: string;
  destinationState?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function printPassengersManifest(
  panel: ManifestPanel | undefined,
  trip: ManifestTrip | undefined,
  allPassengers: BoardingPassenger[],
  getBoardingPointName: (id: string | null | undefined) => string,
  formatCpf: (cpf: string | null | undefined) => string,
  AGE_CATEGORY_LABELS: Record<string, string>,
) {
  const p = panel;
  const tripName = escapeHtml(p?.tripName ?? "");
  const destination = trip ? escapeHtml(`${trip.destinationCity}/${trip.destinationState}`) : "";
  const depDate = p?.departureDate
    ? escapeHtml(format(parseISO(p.departureDate), "dd/MM/yyyy", { locale: ptBR }))
    : "";
  const depTimeRaw = p?.departureDate ? format(parseISO(p.departureDate), "HH:mm") : "";
  const depTime = depTimeRaw && depTimeRaw !== "00:00" ? escapeHtml(depTimeRaw) : "";
  const emitidoEm = escapeHtml(new Date().toLocaleString("pt-BR"));
  const organizador = escapeHtml(p?.tenantName ?? "");
  const cnpj = escapeHtml(p?.tenantCnpj ?? "");
  const manifestNumber = escapeHtml(p?.manifestNumber ?? "");
  const vehiclePlate = escapeHtml(p?.vehiclePlate ?? "");
  const vehicleType = escapeHtml(p?.vehicleType ?? "");
  const driverName = escapeHtml(p?.driverName ?? "");
  const driver1Cpf = escapeHtml(p?.driver1Cpf ?? "");
  const driver1Cnh = escapeHtml(p?.driver1Cnh ?? "");
  const driver1CnhCat = escapeHtml(p?.driver1CnhCategory ?? "");
  const driver1CnhExp = escapeHtml(p?.driver1CnhExpiry ?? "");
  const driver2Name = escapeHtml(p?.driver2Name ?? "");
  const driver2Cpf = escapeHtml(p?.driver2Cpf ?? "");
  const driver2Cnh = escapeHtml(p?.driver2Cnh ?? "");
  const driver2CnhCat = escapeHtml(p?.driver2CnhCategory ?? "");
  const driver2CnhExp = escapeHtml(p?.driver2CnhExpiry ?? "");
  const tourGuide = escapeHtml(p?.tourGuide ?? "");
  const tourGuideCpf = escapeHtml(p?.tourGuideCpf ?? "");
  const tourGuideReg = escapeHtml(p?.tourGuideRegistration ?? "");

  const anttBucket: Record<string, string> = { adult: "adulto", child: "crianca", senior: "idoso", baby: "gratuidade", pcd: "pcd" };
  const catOrder = ["adulto", "crianca", "idoso", "pcd", "gratuidade"];
  const catLabel: Record<string, string> = { adulto: "Adultos", crianca: "Crianças", idoso: "Idosos", pcd: "PCDs", gratuidade: "Gratuidades" };
  const categoryCounts: Record<string, number> = {};
  for (const pass of allPassengers) {
    const bucket = anttBucket[pass.ageCategory] ?? "adulto";
    categoryCounts[bucket] = (categoryCounts[bucket] ?? 0) + 1;
  }

  const rows = allPassengers.map((pass, i) => {
    const nome = escapeHtml(pass.name);
    const cpfStr = escapeHtml(formatCpf(pass.cpf));
    const nasc = pass.birthDate ? escapeHtml(new Date(pass.birthDate).toLocaleDateString("pt-BR")) : "—";
    const cat = escapeHtml(AGE_CATEGORY_LABELS[pass.ageCategory] ?? pass.ageCategory);
    const poltrona = escapeHtml(pass.seatNumber ?? "—");
    const embarque = escapeHtml(getBoardingPointName(pass.boardingLocationId) || "—");
    const obsLines = [pass.documentType, pass.specialNeeds, pass.observations].filter(Boolean).map(s => escapeHtml(s!));
    const obs = obsLines.length > 0 ? obsLines.join(" | ") : "";
    return `<tr>
      <td class="num">${String(i + 1).padStart(2, "0")}</td>
      <td>${nome}</td>
      <td>${cpfStr}</td>
      <td>${nasc}</td>
      <td>${cat}</td>
      <td class="seat">${poltrona}</td>
      <td>${embarque}</td>
      <td class="obs-cell">${obs}</td>
      <td class="sig"></td>
    </tr>`;
  }).join("");

  const totalsRow = catOrder
    .filter(c => categoryCounts[c])
    .map(c => `<span><strong>${catLabel[c] ?? c}:</strong> ${categoryCounts[c]}</span>`)
    .join("&nbsp;&nbsp;|&nbsp;&nbsp;");

  const crewRows = [
    driverName || driver1Cpf || driver1Cnh
      ? `<tr><td>Motorista 1</td><td>${driverName || "—"}</td><td>CNH ${driver1Cnh || "—"}${driver1CnhCat ? ` — Cat. ${driver1CnhCat}` : ""}${driver1CnhExp ? ` — Val. ${driver1CnhExp}` : ""}</td><td>CPF: ${driver1Cpf || "—"}</td></tr>`
      : "",
    driver2Name || driver2Cpf || driver2Cnh
      ? `<tr><td>Motorista 2</td><td>${driver2Name || "—"}</td><td>CNH ${driver2Cnh || "—"}${driver2CnhCat ? ` — Cat. ${driver2CnhCat}` : ""}${driver2CnhExp ? ` — Val. ${driver2CnhExp}` : ""}</td><td>CPF: ${driver2Cpf || "—"}</td></tr>`
      : "",
    tourGuide || tourGuideCpf || tourGuideReg
      ? `<tr><td>Guia de Turismo</td><td>${tourGuide || "—"}</td><td>CADASTUR: ${tourGuideReg || "—"}</td><td>CPF: ${tourGuideCpf || "—"}</td></tr>`
      : "",
  ].filter(Boolean).join("");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Manifesto de Passageiros — ANTT</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; background: #fff; padding: 12mm; }
  .header { border-bottom: 2px solid #000; padding-bottom: 6pt; margin-bottom: 8pt; }
  .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
  .title { font-size: 14pt; font-weight: bold; }
  .subtitle { font-size: 8pt; color: #555; margin-top: 2pt; }
  .manifest-no { font-size: 11pt; font-weight: bold; border: 1px solid #000; padding: 3pt 8pt; }
  .section { margin-bottom: 10pt; }
  .section-title { font-size: 9pt; font-weight: bold; text-transform: uppercase; background: #eee; padding: 3pt 6pt; margin-bottom: 4pt; border-left: 3px solid #333; }
  .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4pt; }
  .meta-item label { font-weight: bold; font-size: 8pt; margin-right: 4pt; }
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  th, td { border: 1px solid #ccc; padding: 3pt 5pt; text-align: left; vertical-align: top; }
  th { background: #ddd; font-weight: bold; font-size: 8pt; }
  .num { width: 24pt; text-align: center; }
  .seat { width: 40pt; text-align: center; }
  .obs-cell { min-width: 70pt; font-size: 7.5pt; }
  .sig { width: 60pt; }
  .totals-row { font-size: 9pt; margin: 4pt 0; }
  .crew-table td { font-size: 8pt; }
  .sig-block { margin-top: 20pt; display: flex; gap: 30pt; }
  .sig-line { flex: 1; border-top: 1px solid #000; padding-top: 4pt; font-size: 8pt; text-align: center; }
  .footer { margin-top: 12pt; display: flex; justify-content: space-between; font-size: 8pt; color: #555; border-top: 1px solid #ccc; padding-top: 4pt; }
  @media print { body { padding: 8mm; } }
</style>
</head>
<body>
<div class="header">
  <div class="header-top">
    <div>
      <div class="title">Manifesto de Passageiros — ANTT</div>
      <div class="subtitle">Resolução ANTT nº 4.777/2015 — Transporte rodoviário de passageiros em excursão</div>
    </div>
    ${manifestNumber ? `<div class="manifest-no">${manifestNumber}</div>` : ""}
  </div>
</div>
<div class="section">
  <div class="section-title">Dados da Excursão</div>
  <div class="meta-grid">
    <div class="meta-item"><label>Excursão:</label>${tripName}</div>
    ${destination ? `<div class="meta-item"><label>Destino:</label>${destination}</div>` : ""}
    <div class="meta-item"><label>Saída:</label>${depDate}${depTime ? ` às ${depTime}` : ""}</div>
    <div class="meta-item"><label>Organizador:</label>${organizador}</div>
    ${cnpj ? `<div class="meta-item"><label>CNPJ:</label>${cnpj}</div>` : ""}
    ${vehicleType || vehiclePlate ? `<div class="meta-item"><label>Veículo:</label>${vehicleType}${vehiclePlate ? ` — ${vehiclePlate}` : ""}</div>` : ""}
  </div>
</div>
${crewRows ? `<div class="section"><div class="section-title">Tripulação</div><table class="crew-table"><thead><tr><th>Função</th><th>Nome</th><th>Habilitação / Registro</th><th>CPF</th></tr></thead><tbody>${crewRows}</tbody></table></div>` : ""}
<div class="section">
  <div class="section-title">Lista de Passageiros (${allPassengers.length})</div>
  <div class="totals-row">${totalsRow}</div>
  <table>
    <thead>
      <tr>
        <th class="num">Nº</th>
        <th>Nome Completo</th>
        <th>CPF</th>
        <th>Nasc.</th>
        <th>Cat.</th>
        <th class="seat">Poltrona</th>
        <th>Embarque</th>
        <th class="obs-cell">Obs / Doc.</th>
        <th class="sig">Assinatura</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>
<div class="sig-block">
  <div class="sig-line">Assinatura do Responsável pela Excursão</div>
  <div class="sig-line">Assinatura do Motorista</div>
</div>
<div class="footer">
  <span>Nº Manifesto: <strong>${manifestNumber || "—"}</strong> &nbsp;|&nbsp; VisiteCRM — Gestão de Agências de Turismo</span>
  <span>Impresso em ${emitidoEm}</span>
</div>
</body>
</html>`;
  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }
}

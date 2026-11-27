import { formatCell, type Report } from "@/server/services/reports";

export function ReportTable({ r }: { r: Report }) {
  if (!r.rows.length) return <p className="p-6 text-center text-[15px] text-muted">Nenhum dado no período e filtros escolhidos.</p>;
  const num = (k?: string) => k === "int" || k === "money" || k === "pct";
  return (
    <div className="overflow-x-auto"><table className="table min-w-[720px]">
      <thead><tr>{r.columns.map((c) => <th key={c.key} className={num(c.kind) ? "text-right" : ""}>{c.label}</th>)}</tr></thead>
      <tbody>{r.rows.map((row, i) => <tr key={i}>{r.columns.map((c) => <td key={c.key} className={num(c.kind) ? "text-right tabular-nums" : ""}>{formatCell(row[c.key], c.kind) || "—"}</td>)}</tr>)}</tbody>
    </table></div>
  );
}

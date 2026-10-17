import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { allPages, downloadReport, request } from "@/lib/api";
import { toast } from "sonner";
type Row = { _id: string | number; name?: string; count: number };
export default function Reports() {
  const [report, setReport] = useState("daily-visitors");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [average, setAverage] = useState<{
    averageDurationSeconds: number | null;
    sampleSize: number;
  }>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const query = new URLSearchParams({
    ...(from ? { dateFrom: from } : {}),
    ...(to ? { dateTo: to } : {}),
  }).toString();
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setRows([]);
    setAverage(undefined);
    const load =
      report === "average-duration"
        ? request<{
            averageDurationSeconds: number | null;
            sampleSize: number;
          }>(`/reports/${report}?${query}`).then((r) => {
            if (active) setAverage(r.data);
          })
        : allPages<Row>(`/reports/${report}?${query}`).then((r) => {
            if (active) setRows(r);
          });
    load
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Report failed");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [report, query, retry]);
  const data = rows.map((r) => ({ ...r, label: r.name || String(r._id) }));
  return (
    <>
      <div className="panel flex flex-wrap items-end gap-4 p-5">
        <label className="min-w-56 flex-1">
          <span className="form-label">Report</span>
          <select
            className="field"
            value={report}
            onChange={(e) => setReport(e.target.value)}
          >
            {[
              "daily-visitors",
              "weekly-visitors",
              "monthly-visitors",
              "by-department",
              "by-host",
              "by-company",
              "average-duration",
              "peak-hours",
            ].map((r) => (
              <option key={r} value={r}>
                {r.replace(/-/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="form-label">From</span>
          <input
            className="field"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          <span className="form-label">To</span>
          <input
            className="field"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          className="btn-light"
          disabled={loading || !!error}
          onClick={async () => {
            try {
              await downloadReport(
                new URLSearchParams({
                  report,
                  ...(from ? { dateFrom: from } : {}),
                  ...(to ? { dateTo: to } : {}),
                }).toString(),
              );
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Export failed");
            }
          }}
        >
          Export CSV
        </button>
      </div>
      {loading ? (
        <p role="status">Loading report…</p>
      ) : error ? (
        <p role="alert" className="text-rose-600">
          {error}
          <button
            className="ml-3 underline"
            onClick={() => setRetry((r) => r + 1)}
          >
            Retry
          </button>
        </p>
      ) : average ? (
        <div className="panel p-8">
          <p className="text-sm">Average completed visit duration</p>
          <p className="my-3 text-4xl font-bold text-blue-600">
            {average.averageDurationSeconds === null
              ? "No samples"
              : `${Math.round(average.averageDurationSeconds / 60)} min`}
          </p>
          <p className="text-xs text-slate-500">
            {average.sampleSize} completed visits
          </p>
        </div>
      ) : (
        <section className="panel p-6">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid stroke="#eef1f5" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#4380ed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Group</th>
                <th className="table-th">Visits</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td className="table-td">{r.label}</td>
                  <td className="table-td">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.length && (
            <p className="p-5 text-sm text-slate-500">No data in this range.</p>
          )}
        </section>
      )}
      <p className="text-xs text-slate-400">
        Reports use actual check-ins and Africa/Lagos dates. The default range
        is the current month.
      </p>
    </>
  );
}

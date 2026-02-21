import { useMemo, useState } from "react";
import { Activity, LineChart as LineChartIcon } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FileUpload } from "./components/FileUpload";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";

interface BackendPageResponse {
  total: number;
  page: number;
  per_page: number;
  columns: string[];
  data: Array<Record<string, unknown>>;
}

interface TradeRow {
  timestamp: string;
  side: string;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  profitLoss: number;
  balance: number | null;
}

interface Metrics {
  totalTrades: number;
  winRate: number;
  avgProfit: number;
  avgLoss: number;
  pointFactor: number;
  profitLoss: number;
  currentBalance: number | null;
}

const PAGE_SIZE = 1000;

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseTrades = (rows: Array<Record<string, unknown>>): TradeRow[] =>
  rows.map((row, index) => ({
    timestamp: String(row.timestamp ?? row.date ?? `row-${index + 1}`),
    side: String(row.side ?? row.action ?? "").toUpperCase(),
    quantity: toNumber(row.quantity),
    entryPrice: toNumber(row.entry_price ?? row.price),
    exitPrice: toNumber(row.exit_price ?? row.price),
    profitLoss: toNumber(row.profit_loss),
    balance:
      row.balance === null || row.balance === undefined || row.balance === ""
        ? null
        : toNumber(row.balance),
  }));

const calculateMetrics = (trades: TradeRow[]): Metrics => {
  const totalTrades = trades.length;
  const wins = trades.filter((trade) => trade.profitLoss > 0);
  const losses = trades.filter((trade) => trade.profitLoss < 0);

  const totalProfit = wins.reduce((sum, trade) => sum + trade.profitLoss, 0);
  const totalLossAbs = losses.reduce((sum, trade) => sum + Math.abs(trade.profitLoss), 0);

  const avgProfit = wins.length > 0 ? totalProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? totalLossAbs / losses.length : 0;
  const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;

  let currentBalance: number | null = null;
  for (let idx = trades.length - 1; idx >= 0; idx -= 1) {
    if (trades[idx].balance !== null) {
      currentBalance = trades[idx].balance;
      break;
    }
  }

  return {
    totalTrades,
    winRate,
    avgProfit,
    avgLoss,
    pointFactor: totalLossAbs > 0 ? totalProfit / totalLossAbs : totalProfit > 0 ? Number.POSITIVE_INFINITY : 0,
    profitLoss: trades.reduce((sum, trade) => sum + trade.profitLoss, 0),
    currentBalance,
  };
};

export default function App() {
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const metrics = useMemo(() => calculateMetrics(trades), [trades]);

  const balanceSeries = useMemo(
    () =>
      trades
        .filter((trade) => trade.balance !== null)
        .map((trade, index) => ({
          label: trade.timestamp,
          index: index + 1,
          balance: trade.balance as number,
        })),
    [trades],
  );

  const fetchCsvPage = async (file: File, page: number): Promise<BackendPageResponse> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`/api/data?page=${page}&per_page=${PAGE_SIZE}`, {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json()) as BackendPageResponse | { error: string };

    if (!response.ok) {
      const message = "error" in payload ? payload.error : "Failed to parse CSV.";
      throw new Error(message);
    }

    return payload as BackendPageResponse;
  };

  const handleFileSelect = async (file: File) => {
    setIsLoading(true);
    setError(null);

    try {
      const firstPage = await fetchCsvPage(file, 1);
      const totalPages = Math.max(1, Math.ceil(firstPage.total / firstPage.per_page));
      const allRows = [...firstPage.data];

      for (let page = 2; page <= totalPages; page += 1) {
        const nextPage = await fetchCsvPage(file, page);
        allRows.push(...nextPage.data);
      }

      setTrades(parseTrades(allRows));
    } catch (err) {
      console.error(err);
      setTrades([]);
      setError(err instanceof Error ? err.message : "Unexpected error while uploading CSV.");
    } finally {
      setIsLoading(false);
    }
  };

  const yDomain = useMemo(() => {
    if (balanceSeries.length === 0) {
      return [0, 1] as const;
    }

    const values = balanceSeries.map((point) => point.balance);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.max((max - min) * 0.08, 50);
    return [Math.max(0, min - padding), max + padding] as const;
  }, [balanceSeries]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-500 p-2">
              <Activity className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Trade Bias Detector</h1>
              <p className="text-sm text-gray-500">Upload a CSV to analyze key performance metrics</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-6xl space-y-8">
          <FileUpload onFileSelect={handleFileSelect} isLoading={isLoading} />

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {trades.length > 0 && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-500">Total Trades</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-semibold">{metrics.totalTrades}</CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-500">Win Rate</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-semibold">{metrics.winRate.toFixed(1)}%</CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-500">Avg Profit</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-semibold text-green-600">
                    ${metrics.avgProfit.toFixed(2)}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-500">Avg Loss</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-semibold text-red-600">
                    ${metrics.avgLoss.toFixed(2)}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-500">Point Factor</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-semibold">
                    {Number.isFinite(metrics.pointFactor) ? metrics.pointFactor.toFixed(2) : "Infinity"}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-500">Profit/Loss</CardTitle>
                  </CardHeader>
                  <CardContent
                    className={`text-2xl font-semibold ${metrics.profitLoss >= 0 ? "text-green-600" : "text-red-600"}`}
                  >
                    ${metrics.profitLoss.toFixed(2)}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-500">Current Balance</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-semibold">
                    {metrics.currentBalance === null ? "-" : `$${metrics.currentBalance.toFixed(2)}`}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <LineChartIcon className="h-5 w-5" />
                    Balance Over Time
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={balanceSeries}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="index"
                          tick={{ fontSize: 12 }}
                          label={{ value: "Trades", position: "insideBottom", offset: -5 }}
                        />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip
                          formatter={(value: number) => [`$${Number(value).toFixed(2)}`, "Balance"]}
                          labelFormatter={(label) => {
                            const point = balanceSeries.find((item) => item.index === Number(label));
                            return point ? point.label : `Trade ${label}`;
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="balance"
                          stroke="#2563eb"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {!isLoading && trades.length === 0 && !error && (
            <div className="py-12 text-center text-gray-500">
              Upload a CSV file to view metrics and balance history.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

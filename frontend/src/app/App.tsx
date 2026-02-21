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

interface InsightTile {
  title: string;
  severity: "low" | "medium" | "high";
  trend: string;
  description: string;
}

const PAGE_SIZE = 1000;
const MAX_NUMERIC_LENGTH = 7;

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatScaled = (
  value: number,
  divisor: number,
  suffix: string,
  maxLength: number,
): string => {
  for (let precision = 2; precision >= 0; precision -= 1) {
    const scaled = (value / divisor).toFixed(precision).replace(/\.?0+$/, "");
    const candidate = `${scaled}${suffix}`;
    if (candidate.length <= maxLength) {
      return candidate;
    }
  }

  return `${(value / divisor).toExponential(1).replace("+", "")}${suffix}`;
};

const condenseDisplayNumber = (value: number, decimals = 2, maxLength = MAX_NUMERIC_LENGTH): string => {
  if (!Number.isFinite(value)) {
    return "Infinity";
  }

  const plain = value.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: decimals,
  });
  if (plain.length <= maxLength) {
    return plain;
  }

  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const signedLimit = Math.max(1, maxLength - sign.length);

  if (abs >= 1_000_000_000) {
    return `${sign}${formatScaled(abs, 1_000_000_000, "B", signedLimit)}`;
  }

  if (abs >= 1_000_000) {
    return `${sign}${formatScaled(abs, 1_000_000, "M", signedLimit)}`;
  }

  if (abs >= 1_000) {
    return `${sign}${formatScaled(abs, 1_000, "K", signedLimit)}`;
  }

  const scientific = value.toExponential(2).replace("+", "");
  if (scientific.length <= maxLength) {
    return scientific;
  }

  return value.toExponential(1).replace("+", "");
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
    pointFactor:
      totalLossAbs > 0 ? totalProfit / totalLossAbs : totalProfit > 0 ? Number.POSITIVE_INFINITY : 0,
    profitLoss: trades.reduce((sum, trade) => sum + trade.profitLoss, 0),
    currentBalance,
  };
};

const getSeverityStyles = (severity: InsightTile["severity"]) => {
  if (severity === "high") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (severity === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
};

const calculateMaxDrawdownPct = (trades: TradeRow[]): number => {
  let runningBalance = 0;
  let peak = Number.NEGATIVE_INFINITY;
  let maxDrawdown = 0;

  trades.forEach((trade) => {
    if (trade.balance !== null) {
      runningBalance = trade.balance;
    } else {
      runningBalance += trade.profitLoss;
    }

    if (runningBalance > peak) {
      peak = runningBalance;
    }

    if (peak > 0) {
      const drawdownPct = ((peak - runningBalance) / peak) * 100;
      if (drawdownPct > maxDrawdown) {
        maxDrawdown = drawdownPct;
      }
    }
  });

  return maxDrawdown;
};

const buildBehavioralInsights = (trades: TradeRow[], metrics: Metrics): InsightTile[] => {
  if (trades.length === 0) {
    return [];
  }

  const avgProfitSafe = Math.max(metrics.avgProfit, 1e-6);
  const lossToWinRatio = metrics.avgLoss / avgProfitSafe;

  const dispositionSeverity: InsightTile["severity"] =
    lossToWinRatio > 1.75 ? "high" : lossToWinRatio > 1.2 ? "medium" : "low";

  const dispositionTile: InsightTile = {
    title: "Disposition Effect",
    severity: dispositionSeverity,
    trend: `${condenseDisplayNumber(lossToWinRatio, 2)}x loss-to-win size ratio`,
    description:
      dispositionSeverity === "low"
        ? "Losses are controlled relative to gains."
        : "Losses are larger than winners, which suggests holding losers too long.",
  };

  const dayBuckets = new Set(
    trades
      .map((trade) => trade.timestamp.split(" ")[0])
      .filter((value) => value.length > 0),
  );
  const activeDays = Math.max(dayBuckets.size, 1);
  const tradesPerDay = trades.length / activeDays;

  const paceSeverity: InsightTile["severity"] =
    tradesPerDay > 30 ? "high" : tradesPerDay > 15 ? "medium" : "low";

  const paceTile: InsightTile = {
    title: "Trading Pace",
    severity: paceSeverity,
    trend: `${condenseDisplayNumber(tradesPerDay, 1)} trades per active day`,
    description:
      paceSeverity === "low"
        ? "Pacing appears stable and selective."
        : "Higher activity can indicate overtrading and reduced selectivity.",
  };

  const splitIndex = Math.max(1, Math.floor(trades.length * 0.8));
  const earlyTrades = trades.slice(0, splitIndex);
  const recentTrades = trades.slice(splitIndex);

  const earlyMean =
    earlyTrades.length > 0
      ? earlyTrades.reduce((sum, trade) => sum + trade.profitLoss, 0) / earlyTrades.length
      : 0;
  const recentMean =
    recentTrades.length > 0
      ? recentTrades.reduce((sum, trade) => sum + trade.profitLoss, 0) / recentTrades.length
      : 0;

  const momentumDelta = recentMean - earlyMean;
  const recencySeverity: InsightTile["severity"] =
    momentumDelta < -Math.abs(earlyMean) * 0.4 ? "high" : momentumDelta < 0 ? "medium" : "low";

  const recencyTile: InsightTile = {
    title: "Recency Bias Trend",
    severity: recencySeverity,
    trend: `Recent avg P/L ${momentumDelta >= 0 ? "up" : "down"} ${condenseDisplayNumber(Math.abs(momentumDelta), 2)} per trade`,
    description:
      recencySeverity === "low"
        ? "Recent decisions are improving or stable versus earlier trades."
        : "Recent outcomes are deteriorating, often seen when reacting to short-term results.",
  };

  const maxDrawdown = calculateMaxDrawdownPct(trades);
  const drawdownSeverity: InsightTile["severity"] =
    maxDrawdown > 20 ? "high" : maxDrawdown > 10 ? "medium" : "low";

  const drawdownTile: InsightTile = {
    title: "Drawdown Control",
    severity: drawdownSeverity,
    trend: `Max drawdown ${condenseDisplayNumber(maxDrawdown, 1)}%`,
    description:
      drawdownSeverity === "low"
        ? "Equity swings are controlled."
        : "Larger drawdowns suggest risk sizing or stop discipline needs tightening.",
  };

  return [dispositionTile, paceTile, recencyTile, drawdownTile];
};

export default function App() {
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const metrics = useMemo(() => calculateMetrics(trades), [trades]);
  const insightTiles = useMemo(() => buildBehavioralInsights(trades, metrics), [trades, metrics]);

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
                  <CardContent className="text-2xl font-semibold">
                    {condenseDisplayNumber(metrics.winRate, 1)}%
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-500">Avg Profit</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-semibold text-green-600">
                    ${condenseDisplayNumber(metrics.avgProfit, 2)}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-500">Avg Loss</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-semibold text-red-600">
                    ${condenseDisplayNumber(metrics.avgLoss, 2)}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-500">Point Factor</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-semibold">
                    {condenseDisplayNumber(metrics.pointFactor, 2)}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-500">Profit/Loss</CardTitle>
                  </CardHeader>
                  <CardContent
                    className={`text-2xl font-semibold ${metrics.profitLoss >= 0 ? "text-green-600" : "text-red-600"}`}
                  >
                    ${condenseDisplayNumber(metrics.profitLoss, 2)}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-500">Current Balance</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-semibold">
                    {metrics.currentBalance === null ? "-" : `$${condenseDisplayNumber(metrics.currentBalance, 2)}`}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-3">
                <div>
                  <h2 className="text-xl font-semibold">Behavioral Finance Insights & Trends</h2>
                  <p className="text-sm text-gray-500">Pattern alerts inferred from your trade outcomes and pacing</p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {insightTiles.map((tile) => (
                    <Card key={tile.title}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{tile.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getSeverityStyles(tile.severity)}`}>
                          {tile.severity.toUpperCase()}
                        </div>
                        <p className="text-lg font-semibold text-gray-900">{tile.trend}</p>
                        <p className="text-sm text-gray-600">{tile.description}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
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
                        <YAxis tick={{ fontSize: 12 }} domain={[yDomain[0], yDomain[1]]} />
                        <Tooltip
                          formatter={(value: number) => [`$${condenseDisplayNumber(Number(value), 2)}`, "Balance"]}
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

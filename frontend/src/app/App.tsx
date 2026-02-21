import { useMemo, useRef, useState } from "react";
import {
  Activity,
  Brain,
  LayoutDashboard,
  LineChart as LineChartIcon,
  MessageSquareText,
  Send,
} from "lucide-react";
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
import { Button } from "./components/ui/button";
import { Textarea } from "./components/ui/textarea";

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

interface AiCoachResponse {
  summary: string;
  sentiment: {
    label: "positive" | "neutral" | "negative";
    score: number;
    evidence: string;
  };
  risk_profile: {
    score: number;
    tier: string;
    rationale: string;
  };
  optimization_suggestions: string[];
  future_bias_triggers: string[];
  coaching_prompts: string[];
  source: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  source?: string;
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
    trend: `${lossToWinRatio.toFixed(2)}x loss-to-win size ratio`,
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
    trend: `${tradesPerDay.toFixed(1)} trades per active day`,
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
    trend: `Recent avg P/L ${momentumDelta >= 0 ? "up" : "down"} ${Math.abs(momentumDelta).toFixed(2)} per trade`,
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
    trend: `Max drawdown ${maxDrawdown.toFixed(1)}%`,
    description:
      drawdownSeverity === "low"
        ? "Equity swings are controlled."
        : "Larger drawdowns suggest risk sizing or stop discipline needs tightening.",
  };

  return [dispositionTile, paceTile, recencyTile, drawdownTile];
};

export default function App() {
  const [activePage, setActivePage] = useState<"dashboard" | "coach">("dashboard");
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCoachLoading, setIsCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [coachResponse, setCoachResponse] = useState<AiCoachResponse | null>(null);
  const [coachGeneratedAt, setCoachGeneratedAt] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatSource, setChatSource] = useState<string | null>(null);
  const traderNotesRef = useRef<HTMLTextAreaElement | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);

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

  const generateAiCoach = async (
    nextTrades: TradeRow[],
    nextMetrics: Metrics,
    nextInsightTiles: InsightTile[],
    notes: string,
  ) => {
    if (nextTrades.length === 0) {
      setCoachResponse(null);
      return;
    }

    setIsCoachLoading(true);
    setCoachError(null);

    try {
      const response = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metrics: nextMetrics,
          insights: nextInsightTiles,
          trader_notes: notes,
          recent_trades: nextTrades.slice(-50),
        }),
      });

      const payload = (await response.json()) as AiCoachResponse | { error: string };
      if (!response.ok) {
        const message = "error" in payload ? payload.error : "Failed to generate AI coaching insights.";
        throw new Error(message);
      }

      setCoachResponse(payload as AiCoachResponse);
      setCoachGeneratedAt(new Date().toLocaleTimeString());
    } catch (err) {
      console.error(err);
      setCoachResponse(null);
      setCoachGeneratedAt(null);
      setCoachError(err instanceof Error ? err.message : "Unexpected error while generating AI insights.");
    } finally {
      setIsCoachLoading(false);
    }
  };

  const sendChatMessage = async () => {
    const userMessage = (chatInputRef.current?.value ?? "").trim();
    if (!userMessage || isChatLoading || trades.length === 0) {
      return;
    }

    const nextMessages: ChatMessage[] = [...chatMessages, { role: "user", content: userMessage }];
    setChatMessages(nextMessages);
    if (chatInputRef.current) {
      chatInputRef.current.value = "";
    }
    setIsChatLoading(true);
    setChatError(null);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          history: chatMessages.slice(-8),
          metrics,
          insights: insightTiles,
          trader_notes: traderNotesRef.current?.value ?? "",
        }),
      });

      const payload = (await response.json()) as { reply: string; source: string } | { error: string };
      if (!response.ok) {
        const message = "error" in payload ? payload.error : "Failed to get AI chat reply.";
        throw new Error(message);
      }

      const assistantReply = payload as { reply: string; source: string };
      setChatMessages((current) => [
        ...current,
        { role: "assistant", content: assistantReply.reply, source: assistantReply.source },
      ]);
      setChatSource(assistantReply.source);
    } catch (err) {
      console.error(err);
      setChatError(err instanceof Error ? err.message : "Unexpected error while chatting with AI coach.");
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleFileSelect = async (file: File) => {
    setIsLoading(true);
    setError(null);
    setCoachError(null);
    setCoachResponse(null);
    setCoachGeneratedAt(null);
    setChatError(null);
    setChatMessages([]);

    try {
      const firstPage = await fetchCsvPage(file, 1);
      const totalPages = Math.max(1, Math.ceil(firstPage.total / firstPage.per_page));
      const allRows = [...firstPage.data];

      for (let page = 2; page <= totalPages; page += 1) {
        const nextPage = await fetchCsvPage(file, page);
        allRows.push(...nextPage.data);
      }

      const parsedTrades = parseTrades(allRows);
      const computedMetrics = calculateMetrics(parsedTrades);
      const computedInsights = buildBehavioralInsights(parsedTrades, computedMetrics);
      setTrades(parsedTrades);
      await generateAiCoach(
        parsedTrades,
        computedMetrics,
        computedInsights,
        traderNotesRef.current?.value ?? "",
      );
    } catch (err) {
      console.error(err);
      setTrades([]);
      setCoachResponse(null);
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
          <div className="rounded-xl border bg-white p-2 shadow-sm">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={activePage === "dashboard" ? "default" : "outline"}
                className="justify-center"
                onClick={() => setActivePage("dashboard")}
              >
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Dashboard
              </Button>
              <Button
                variant={activePage === "coach" ? "default" : "outline"}
                className="justify-center"
                onClick={() => setActivePage("coach")}
              >
                <Brain className="mr-2 h-4 w-4" />
                AI Coach
              </Button>
            </div>
          </div>

          {activePage === "dashboard" && (
            <>
              <FileUpload onFileSelect={handleFileSelect} isLoading={isLoading} />

<<<<<<< Updated upstream
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

              <div className="space-y-3">
                <div>
                  <h2 className="text-xl font-semibold">Behavioral Finance Insights & Trends</h2>
                  <p className="text-sm text-gray-500">Pattern alerts inferred from your trade outcomes and pacing</p>
=======
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
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
=======
>>>>>>> Stashed changes
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
                            <Line type="monotone" dataKey="balance" stroke="#2563eb" strokeWidth={2} dot={false} />
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
            </>
          )}

          {activePage === "coach" && (
            <>
              {trades.length === 0 ? (
                <Card className="border-blue-100 bg-gradient-to-br from-white to-blue-50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <Brain className="h-6 w-6 text-blue-600" />
                      AI Coach Page
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-gray-600">
                      Upload your CSV on the Dashboard page first. Then come back here for the chat and coaching report.
                    </p>
                    <Button onClick={() => setActivePage("dashboard")}>Go To Dashboard</Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 via-white to-cyan-50 p-6">
                    <h2 className="text-2xl font-bold text-slate-900">AI Trading Coach</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Ask questions in simple language and get student-friendly coaching based on your uploaded trade data.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
                    <Card className="lg:col-span-2">
                      <CardHeader>
                        <CardTitle className="text-base">Context For AI</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-gray-600">
                          This is optional background information for AI. Add how you felt, what confused you, or what
                          decision you want feedback on. It helps the report and chat give more personal guidance.
                        </p>
                        <Textarea
                          id="trader-notes"
                          rows={6}
                          ref={traderNotesRef}
                          placeholder="Add context: How were you feeling? What went wrong? What do you want help with?"
                        />
                        <Button
                          onClick={() =>
                            generateAiCoach(trades, metrics, insightTiles, traderNotesRef.current?.value ?? "")
                          }
                          disabled={isCoachLoading || isLoading}
                          className="w-full"
                        >
                          <MessageSquareText className="mr-2 h-4 w-4" />
                          {isCoachLoading ? "Generating..." : "Generate Coaching Report"}
                        </Button>
                        {coachResponse && <p className="text-xs text-gray-500">Model source: {coachResponse.source}</p>}
                        {coachGeneratedAt && (
                          <p className="text-xs text-emerald-700">Report generated at {coachGeneratedAt}</p>
                        )}
                        {coachError && (
                          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {coachError}
                          </div>
                        )}
                        {!coachResponse && !coachError && (
                          <div className="rounded-lg border bg-gray-50 p-3 text-sm text-gray-600">
                            No coaching report yet. Click <span className="font-medium">Generate Coaching Report</span>.
                          </div>
                        )}
                        {coachResponse && (
                          <div className="space-y-3 rounded-lg border bg-gray-50 p-3 text-sm">
                            <p className="font-medium">Summary</p>
                            <p>{coachResponse.summary}</p>
                            <p className="text-gray-600">
                              Sentiment: {coachResponse.sentiment.label} ({condenseDisplayNumber(coachResponse.sentiment.score * 100, 0)}%)
                            </p>
                            <p className="text-gray-600">
                              Risk profile: {coachResponse.risk_profile.tier} ({condenseDisplayNumber(coachResponse.risk_profile.score, 1)}/100)
                            </p>
                            <div>
                              <p className="mb-1 font-medium">Simple Next Steps</p>
                              <ul className="list-disc space-y-1 pl-5 text-gray-700">
                                {coachResponse.optimization_suggestions.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="lg:col-span-3">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Trading Coach Chat</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {chatSource && (
                          <div className="text-xs text-gray-500">
                            Chat mode: <span className="font-medium">{chatSource}</span>
                          </div>
                        )}
                        <div className="max-h-[430px] min-h-[430px] space-y-2 overflow-y-auto rounded-lg border bg-slate-50 p-3">
                          {chatMessages.length === 0 && (
                            <p className="text-sm text-gray-500">
                              Ask anything. Example: "I panic after losses. What simple rule should I follow?"
                            </p>
                          )}
                          {chatMessages.map((message, index) => (
                            <div
                              key={`${message.role}-${index}`}
                              className={`rounded-md px-3 py-2 text-sm ${
                                message.role === "user"
                                  ? "ml-8 bg-blue-600 text-white"
                                  : "mr-8 border bg-white text-gray-800"
                              }`}
                            >
                              {message.content}
                              {message.role === "assistant" && message.source && (
                                <div className="mt-1 text-[11px] text-gray-500">{message.source}</div>
                              )}
                            </div>
                          ))}
                        </div>
                        <Textarea rows={3} ref={chatInputRef} placeholder="Type your question and press Send..." />
                        <div className="flex items-center gap-3">
                          <Button onClick={sendChatMessage} disabled={isChatLoading || isLoading}>
                            <Send className="mr-2 h-4 w-4" />
                            {isChatLoading ? "Thinking..." : "Send"}
                          </Button>
                          <Button variant="outline" onClick={() => setChatMessages([])} disabled={isChatLoading}>
                            Clear Chat
                          </Button>
                        </div>
                        {chatError && (
                          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {chatError}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

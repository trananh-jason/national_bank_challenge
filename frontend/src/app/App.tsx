import { useMemo, useState } from "react";
import * as Papa from "papaparse";
import { Activity } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { FileUpload } from "./components/FileUpload";
import { InsightsDisplay, BiasInsight, TradeStats } from "./components/InsightsDisplay";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "./components/ui/chart";

type Side = "BUY" | "SELL";

interface Trade {
  timestamp: string;
  asset: string;
  side: Side;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  profitLoss: number;
  balance: number;
}

interface BalancePoint {
  timestamp: string;
  balance: number;
}

const chartConfig = {
  balance: {
    label: "Balance",
    color: "hsl(216, 95%, 56%)",
  },
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);

const normalizeHeader = (key: string) => key.toLowerCase().trim().replace(/\s+/g, "_");

const normalizeRow = (row: Record<string, unknown>) => {
  const normalized: Record<string, unknown> = {};
  Object.entries(row).forEach(([key, value]) => {
    normalized[normalizeHeader(key)] = value;
  });
  return normalized;
};

const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return Number.NaN;
  }

  if (typeof value === "number") {
    return value;
  }

  return Number(String(value).replace(/[$,]/g, "").trim());
};

const formatTimeLabel = (timestamp: string) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function App() {
  const [insights, setInsights] = useState<BiasInsight[] | null>(null);
  const [stats, setStats] = useState<TradeStats | null>(null);
  const [balanceSeries, setBalanceSeries] = useState<BalancePoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const analyzeTrades = (trades: Trade[]) => {
    const totalTrades = trades.length;

    const profits = trades.filter((t) => t.profitLoss > 0).map((t) => t.profitLoss);
    const losses = trades.filter((t) => t.profitLoss < 0).map((t) => Math.abs(t.profitLoss));

    const totalProfit = profits.reduce((sum, value) => sum + value, 0);
    const totalLoss = losses.reduce((sum, value) => sum + value, 0);
    const totalPnL = trades.reduce((sum, trade) => sum + trade.profitLoss, 0);

    const winRate = totalTrades > 0 ? (profits.length / totalTrades) * 100 : 0;
    const avgProfit = profits.length > 0 ? totalProfit / profits.length : 0;
    const avgLoss = losses.length > 0 ? totalLoss / losses.length : 0;
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Number.POSITIVE_INFINITY : 0;

    const sortedByTime = [...trades].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    const currentBalance = sortedByTime.at(-1)?.balance ?? 0;
    const startingBalance = sortedByTime.at(0)?.balance ?? 0;

    const tradeStats: TradeStats = {
      totalTrades,
      winRate: Number(winRate.toFixed(1)),
      avgProfit,
      avgLoss,
      profitFactor,
      totalPnL,
      currentBalance,
      startingBalance,
    };

    const detectedBiases: BiasInsight[] = [];

    if (avgProfit > 0 && avgLoss > avgProfit * 1.5) {
      detectedBiases.push({
        type: "Loss Aversion Bias",
        severity: "high",
        description:
          "Your average loss is significantly higher than your average profit, suggesting you may be holding onto losing positions too long.",
        recommendation:
          "Implement strict stop-loss rules and stick to them. Cut losses quickly and let winners run.",
        metric: Math.min((avgLoss / avgProfit) * 50, 100),
      });
    }

    const symbolTrades: Record<string, number> = {};
    trades.forEach((trade) => {
      symbolTrades[trade.asset] = (symbolTrades[trade.asset] || 0) + 1;
    });

    const symbolCount = Object.keys(symbolTrades).length;
    const tradesPerSymbol = symbolCount > 0 ? totalTrades / symbolCount : 0;
    if (tradesPerSymbol > 8) {
      detectedBiases.push({
        type: "Overtrading Bias",
        severity: "medium",
        description: `High trade frequency detected (${tradesPerSymbol.toFixed(
          1,
        )} trades per asset). This may indicate emotional trading or lack of strategy discipline.`,
        recommendation:
          "Focus on quality over quantity. Wait for high-probability setups and avoid impulsive trades.",
        metric: Math.min(tradesPerSymbol * 10, 100),
      });
    }

    const recentTrades = sortedByTime.slice(-Math.floor(totalTrades / 3));
    const recentConcentration = totalTrades > 0 ? (recentTrades.length / totalTrades) * 100 : 0;
    if (recentConcentration > 40) {
      detectedBiases.push({
        type: "Recency Bias",
        severity: "medium",
        description:
          "High concentration of trades in the most recent period may indicate reactive trading based on short-term outcomes.",
        recommendation:
          "Maintain consistent trade criteria and avoid changing strategy after short streaks.",
        metric: recentConcentration,
      });
    }

    const maxFreq = Math.max(...Object.values(symbolTrades), 0);
    const concentration = totalTrades > 0 ? (maxFreq / totalTrades) * 100 : 0;
    if (concentration > 25) {
      detectedBiases.push({
        type: "Confirmation Bias",
        severity: "low",
        description: `Heavy focus on one asset (${concentration.toFixed(
          1,
        )}% concentration) may indicate bias toward familiar names.`,
        recommendation:
          "Diversify your research universe and challenge assumptions before re-entering the same symbols.",
        metric: concentration,
      });
    }

    if (winRate < 40) {
      detectedBiases.push({
        type: "Strategy Effectiveness",
        severity: "high",
        description: `Win rate of ${winRate.toFixed(
          1,
        )}% is below your likely target range and suggests strategy execution issues.`,
        recommendation:
          "Review entry and exit criteria, then test updated rules on a small sample before scaling up.",
        metric: 100 - winRate,
      });
    }

    return { insights: detectedBiases, stats: tradeStats, sortedByTime };
  };

  const handleFileSelect = (file: File) => {
    setIsLoading(true);
    setInsights(null);
    setStats(null);
    setBalanceSeries([]);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const rawRows = (results.data as Record<string, unknown>[]).map(normalizeRow);

          const trades: Trade[] = rawRows
            .map((row) => {
              const timestamp = String(row.timestamp ?? "").trim();
              const asset = String(row.asset ?? "").trim().toUpperCase();
              const side = String(row.side ?? "").trim().toUpperCase() as Side;

              return {
                timestamp,
                asset,
                side,
                quantity: toNumber(row.quantity),
                entryPrice: toNumber(row.entry_price),
                exitPrice: toNumber(row.exit_price),
                profitLoss: toNumber(row.profit_loss),
                balance: toNumber(row.balance),
              };
            })
            .filter((trade) => {
              const sideIsValid = trade.side === "BUY" || trade.side === "SELL";
              return (
                trade.timestamp &&
                trade.asset &&
                sideIsValid &&
                Number.isFinite(trade.quantity) &&
                Number.isFinite(trade.profitLoss) &&
                Number.isFinite(trade.balance)
              );
            });

          if (trades.length === 0) {
            throw new Error("No valid trade rows found in CSV.");
          }

          const { insights: newInsights, stats: newStats, sortedByTime } = analyzeTrades(trades);

          setInsights(newInsights);
          setStats(newStats);
          setBalanceSeries(
            sortedByTime.map((trade) => ({
              timestamp: trade.timestamp,
              balance: trade.balance,
            })),
          );
        } catch (error) {
          console.error("Error analyzing trades:", error);
          alert("Error analyzing trades. Please verify CSV headers and numeric values.");
        } finally {
          setIsLoading(false);
        }
      },
      error: (error) => {
        console.error("Error parsing CSV:", error);
        alert("Error parsing CSV file. Please check the format.");
        setIsLoading(false);
      },
    });
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
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Trade Bias Detector</h1>
              <p className="text-gray-500 text-sm">
                Analyze your trading patterns and identify cognitive biases
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto space-y-8">
          <FileUpload onFileSelect={handleFileSelect} isLoading={isLoading} />

          {insights && stats && (
            <div className="space-y-6 animate-in fade-in duration-500">
              <InsightsDisplay insights={insights} stats={stats} />

              <Card>
                <CardHeader>
                  <CardTitle>Balance Over Time</CardTitle>
                  <CardDescription>
                    Temporal balance trend from {formatCurrency(stats.startingBalance)} to {formatCurrency(stats.currentBalance)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-[320px] w-full">
                    <LineChart data={balanceSeries} margin={{ top: 12, right: 16, left: 12, bottom: 0 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="timestamp"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        minTickGap={24}
                        tickFormatter={formatTimeLabel}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => formatCurrency(Number(value))}
                        domain={yDomain}
                        width={90}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            labelFormatter={(label) => String(label)}
                            formatter={(value) => formatCurrency(Number(value))}
                          />
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="balance"
                        stroke="var(--color-balance)"
                        strokeWidth={2.5}
                        dot={false}
                      />
                    </LineChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {!insights && !isLoading && (
            <div className="text-center py-12 text-gray-500">
              <p>Upload a CSV file to get started with bias analysis</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

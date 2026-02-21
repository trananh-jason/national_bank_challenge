import { AlertTriangle, TrendingUp, TrendingDown, DollarSign, BarChart3, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";

export interface BiasInsight {
  type: string;
  severity: "low" | "medium" | "high";
  description: string;
  recommendation: string;
  metric: number;
}

export interface TradeStats {
  totalTrades: number;
  winRate: number;
  avgProfit: number;
  avgLoss: number;
  profitFactor: number;
  totalPnL: number;
  currentBalance: number;
  startingBalance: number;
}

interface InsightsDisplayProps {
  insights: BiasInsight[];
  stats: TradeStats;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);

export function InsightsDisplay({ insights, stats }: InsightsDisplayProps) {
  const getSeverityBadgeVariant = (severity: string) => {
    switch (severity) {
      case "high":
        return "destructive";
      case "medium":
        return "default";
      case "low":
        return "secondary";
      default:
        return "outline";
    }
  };

  const profitFactorLabel = Number.isFinite(stats.profitFactor)
    ? stats.profitFactor.toFixed(2)
    : "∞";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Trade Statistics</CardTitle>
          <CardDescription>Overview of your trading performance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-7 gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <BarChart3 className="w-4 h-4" />
                <span>Total Trades</span>
              </div>
              <div className="font-semibold text-2xl">{stats.totalTrades}</div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <TrendingUp className="w-4 h-4" />
                <span>Win Rate</span>
              </div>
              <div className="font-semibold text-2xl">{stats.winRate}%</div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <DollarSign className="w-4 h-4 text-green-500" />
                <span>Avg Profit</span>
              </div>
              <div className="font-semibold text-2xl text-green-600">
                {formatCurrency(stats.avgProfit)}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <TrendingDown className="w-4 h-4 text-red-500" />
                <span>Avg Loss</span>
              </div>
              <div className="font-semibold text-2xl text-red-600">
                {formatCurrency(stats.avgLoss)}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <BarChart3 className="w-4 h-4" />
                <span>Profit Factor</span>
              </div>
              <div className="font-semibold text-2xl">{profitFactorLabel}</div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <DollarSign className={`w-4 h-4 ${stats.totalPnL >= 0 ? "text-green-500" : "text-red-500"}`} />
                <span>Total P/L</span>
              </div>
              <div className={`font-semibold text-2xl ${stats.totalPnL >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(stats.totalPnL)}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Wallet className="w-4 h-4 text-blue-500" />
                <span>Current Balance</span>
              </div>
              <div className="font-semibold text-2xl text-blue-600">
                {formatCurrency(stats.currentBalance)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-2xl font-semibold mb-4">Detected Biases</h2>
        <div className="space-y-4">
          {insights.map((insight, index) => (
            <Card key={index}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="rounded-full bg-orange-50 p-2 mt-1">
                      <AlertTriangle className="w-5 h-5 text-orange-500" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <CardTitle className="text-lg">{insight.type}</CardTitle>
                        <Badge variant={getSeverityBadgeVariant(insight.severity)}>
                          {insight.severity.toUpperCase()}
                        </Badge>
                      </div>
                      <CardDescription className="text-sm">{insight.description}</CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-500">Bias Indicator</span>
                    <span className="font-medium">{insight.metric.toFixed(1)}%</span>
                  </div>
                  <Progress value={insight.metric} className="h-2" />
                </div>
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                  <p className="text-sm">
                    <span className="font-semibold">Recommendation: </span>
                    {insight.recommendation}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

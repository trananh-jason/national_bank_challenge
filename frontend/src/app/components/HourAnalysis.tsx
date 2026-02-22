import { AlertTriangle, Clock, TrendingUp } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Badge } from "./ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

export interface HourMetrics {
  hour: number;
  tradeCount: number;
  totalPnl: number;
  winRate: number;
  expectancy: number;
}

export interface HourAnalysis {
  hourMetrics: HourMetrics[];
  negativeExpectancyHours: number[];
  strongestHours: number[];
  earlySessionVolatility: boolean;
}

interface HourAnalysisProps {
  analysis: HourAnalysis;
}

const condenseDisplayNumber = (value: number, decimals = 2): string => {
  if (!Number.isFinite(value)) {
    return "Infinity";
  }

  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(decimals)}M`;
  }

  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toFixed(decimals)}K`;
  }

  return value.toFixed(decimals);
};

const formatHour = (hour: number): string => {
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:00 ${period}`;
};

export function HourAnalysis({ analysis }: HourAnalysisProps) {
  if (
    !analysis ||
    !analysis.hourMetrics ||
    !Array.isArray(analysis.hourMetrics)
  ) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trading Hour Analysis</CardTitle>
          <CardDescription>Performance metrics by trading hour</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">
            No trading hour data available.
          </p>
        </CardContent>
      </Card>
    );
  }

  const {
    hourMetrics,
    negativeExpectancyHours = [],
    strongestHours = [],
    earlySessionVolatility = false,
  } = analysis;

  const chartData = hourMetrics.map((hm) => ({
    hour: hm.hour,
    hourLabel: formatHour(hm.hour),
    totalPnl: hm.totalPnl,
    expectancy: hm.expectancy,
    tradeCount: hm.tradeCount,
  }));

  const getBarColor = (hour: number) => {
    if (Array.isArray(strongestHours) && strongestHours.includes(hour)) {
      return "#10b981"; // green
    }
    if (
      Array.isArray(negativeExpectancyHours) &&
      negativeExpectancyHours.includes(hour)
    ) {
      return "#ef4444"; // red
    }
    return "#3b82f6"; // blue
  };

  const activeHours = hourMetrics.filter((hm) => hm.tradeCount > 0);

  if (activeHours.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trading Hour Analysis</CardTitle>
          <CardDescription>Performance metrics by trading hour</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">
            No trading hour data available.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Trading Hour Analysis
          </CardTitle>
          <CardDescription>
            Performance metrics grouped by hour of day (UTC)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {earlySessionVolatility && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-semibold">
                  Early Session Volatility Detected
                </span>
              </div>
              <p className="mt-1">
                Hours 9-10 (9:00-10:59 UTC) show negative expectancy or high
                volatility. Consider reducing activity during this period.
              </p>
            </div>
          )}

          <div className="mb-6">
            <h3 className="text-sm font-semibold mb-2">Total P/L by Hour</h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="hourLabel"
                    tick={{ fontSize: 11 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      if (name === "totalPnl") {
                        return [
                          `$${condenseDisplayNumber(value, 2)}`,
                          "Total P/L",
                        ];
                      }
                      if (name === "expectancy") {
                        return [
                          `$${condenseDisplayNumber(value, 2)}`,
                          "Expectancy",
                        ];
                      }
                      return [value, name];
                    }}
                    labelFormatter={(label) => `Hour: ${label}`}
                  />
                  <Bar dataKey="totalPnl" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={getBarColor(entry.hour)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-4">
            {negativeExpectancyHours.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2 text-red-600">
                  Hours with Negative Expectancy
                </h3>
                <div className="flex flex-wrap gap-2">
                  {negativeExpectancyHours.map((hour) => {
                    const hm = hourMetrics.find((h) => h.hour === hour);
                    return (
                      <Badge
                        key={hour}
                        variant="destructive"
                        className="text-xs"
                      >
                        {formatHour(hour)}:{" "}
                        {hm
                          ? `${hm.tradeCount} trades, $${condenseDisplayNumber(hm.expectancy, 2)} exp`
                          : ""}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}

            {strongestHours.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2 text-green-600 flex items-center gap-1">
                  <TrendingUp className="h-4 w-4" />
                  Strongest Performance Hours
                </h3>
                <div className="flex flex-wrap gap-2">
                  {strongestHours.map((hour) => {
                    const hm = hourMetrics.find((h) => h.hour === hour);
                    return (
                      <Badge
                        key={hour}
                        variant="secondary"
                        className="text-xs bg-green-100 text-green-800"
                      >
                        {formatHour(hour)}:{" "}
                        {hm
                          ? `${hm.tradeCount} trades, $${condenseDisplayNumber(hm.totalPnl, 2)} P/L`
                          : ""}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hour-by-Hour Metrics</CardTitle>
          <CardDescription>
            Detailed performance breakdown by trading hour
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hour</TableHead>
                  <TableHead>Trade Count</TableHead>
                  <TableHead>Total P/L</TableHead>
                  <TableHead>Win Rate</TableHead>
                  <TableHead>Expectancy</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hourMetrics
                  .filter((hm) => hm.tradeCount > 0)
                  .map((hm) => (
                    <TableRow key={hm.hour}>
                      <TableCell className="font-medium">
                        {formatHour(hm.hour)}
                      </TableCell>
                      <TableCell>{hm.tradeCount}</TableCell>
                      <TableCell
                        className={
                          hm.totalPnl >= 0
                            ? "text-green-600 font-semibold"
                            : "text-red-600 font-semibold"
                        }
                      >
                        ${condenseDisplayNumber(hm.totalPnl, 2)}
                      </TableCell>
                      <TableCell>{hm.winRate.toFixed(1)}%</TableCell>
                      <TableCell
                        className={
                          hm.expectancy >= 0 ? "text-green-600" : "text-red-600"
                        }
                      >
                        ${condenseDisplayNumber(hm.expectancy, 2)}
                      </TableCell>
                      <TableCell>
                        {Array.isArray(strongestHours) &&
                        strongestHours.includes(hm.hour) ? (
                          <Badge
                            variant="secondary"
                            className="bg-green-100 text-green-800"
                          >
                            Strong
                          </Badge>
                        ) : Array.isArray(negativeExpectancyHours) &&
                          negativeExpectancyHours.includes(hm.hour) ? (
                          <Badge variant="destructive">Weak</Badge>
                        ) : (
                          <Badge variant="outline">Neutral</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

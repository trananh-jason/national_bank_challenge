import { useState } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
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

export interface AssetMetrics {
  asset: string;
  totalPnl: number;
  tradeCount: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  expectancy: number;
  grossProfit: number;
  grossLoss: number;
}

export interface AssetOptimization {
  asset: string;
  metrics: AssetMetrics;
  suggestions: string[];
  rankByNetPnl: number;
  rankByProfitFactor: number;
  rankByExpectancy: number;
}

interface AssetOptimizationProps {
  optimizations: AssetOptimization[];
}

type SortField =
  | "asset"
  | "totalPnl"
  | "tradeCount"
  | "winRate"
  | "profitFactor"
  | "expectancy";
type SortDirection = "asc" | "desc";

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

export function AssetOptimization({ optimizations }: AssetOptimizationProps) {
  if (!optimizations || !Array.isArray(optimizations)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Asset-Level Optimization</CardTitle>
          <CardDescription>Performance metrics by asset</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">
            No asset data available. Ensure your CSV includes an asset column.
          </p>
        </CardContent>
      </Card>
    );
  }

  const [sortField, setSortField] = useState<SortField>("totalPnl");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const sortedOptimizations = [...optimizations]
    .filter(
      (opt) => opt && opt.metrics && typeof opt.metrics.totalPnl === "number",
    )
    .sort((a, b) => {
      let aValue: number;
      let bValue: number;

      switch (sortField) {
        case "asset":
          return sortDirection === "asc"
            ? (a.asset || "").localeCompare(b.asset || "")
            : (b.asset || "").localeCompare(a.asset || "");
        case "totalPnl":
          aValue = a.metrics?.totalPnl || 0;
          bValue = b.metrics?.totalPnl || 0;
          break;
        case "tradeCount":
          aValue = a.metrics?.tradeCount || 0;
          bValue = b.metrics?.tradeCount || 0;
          break;
        case "winRate":
          aValue = a.metrics?.winRate || 0;
          bValue = b.metrics?.winRate || 0;
          break;
        case "profitFactor":
          aValue = Number.isFinite(a.metrics?.profitFactor)
            ? a.metrics?.profitFactor || 0
            : 0;
          bValue = Number.isFinite(b.metrics?.profitFactor)
            ? b.metrics?.profitFactor || 0
            : 0;
          break;
        case "expectancy":
          aValue = a.metrics?.expectancy || 0;
          bValue = b.metrics?.expectancy || 0;
          break;
        default:
          return 0;
      }

      return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
    });

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="h-4 w-4 ml-1" />
    ) : (
      <ArrowDown className="h-4 w-4 ml-1" />
    );
  };

  if (optimizations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Asset-Level Optimization</CardTitle>
          <CardDescription>Performance metrics by asset</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">
            No asset data available. Ensure your CSV includes an asset column.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Asset-Level Optimization</CardTitle>
        <CardDescription>
          Performance metrics, rankings, and optimization suggestions by asset
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort("asset")}
                >
                  <div className="flex items-center">
                    Asset
                    <SortIcon field="asset" />
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort("totalPnl")}
                >
                  <div className="flex items-center">
                    Total P/L
                    <SortIcon field="totalPnl" />
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort("tradeCount")}
                >
                  <div className="flex items-center">
                    Trades
                    <SortIcon field="tradeCount" />
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort("winRate")}
                >
                  <div className="flex items-center">
                    Win Rate
                    <SortIcon field="winRate" />
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort("profitFactor")}
                >
                  <div className="flex items-center">
                    Profit Factor
                    <SortIcon field="profitFactor" />
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort("expectancy")}
                >
                  <div className="flex items-center">
                    Expectancy
                    <SortIcon field="expectancy" />
                  </div>
                </TableHead>
                <TableHead>Rankings</TableHead>
                <TableHead>Suggestions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedOptimizations.map((opt) => (
                <TableRow key={opt.asset}>
                  <TableCell className="font-medium">{opt.asset}</TableCell>
                  <TableCell
                    className={
                      opt.metrics.totalPnl >= 0
                        ? "text-green-600 font-semibold"
                        : "text-red-600 font-semibold"
                    }
                  >
                    ${condenseDisplayNumber(opt.metrics.totalPnl, 2)}
                  </TableCell>
                  <TableCell>{opt.metrics.tradeCount}</TableCell>
                  <TableCell>{opt.metrics.winRate.toFixed(1)}%</TableCell>
                  <TableCell>
                    {Number.isFinite(opt.metrics.profitFactor)
                      ? opt.metrics.profitFactor.toFixed(2)
                      : "∞"}
                  </TableCell>
                  <TableCell
                    className={
                      opt.metrics.expectancy >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }
                  >
                    ${condenseDisplayNumber(opt.metrics.expectancy, 2)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-xs">
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3 text-blue-500" />
                        <span>P/L: #{opt.rankByNetPnl}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3 text-blue-500" />
                        <span>PF: #{opt.rankByProfitFactor}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3 text-blue-500" />
                        <span>Exp: #{opt.rankByExpectancy}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {opt.suggestions.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {opt.suggestions.map((suggestion, idx) => (
                          <Badge
                            key={idx}
                            variant="destructive"
                            className="text-xs w-fit flex items-center gap-1"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {suggestion}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        No issues detected
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

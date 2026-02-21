import type { ChangeEvent, DragEvent } from "react";
import { Upload, FileText } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isLoading?: boolean;
}

export function FileUpload({ onFileSelect, isLoading }: FileUploadProps) {
  const isCsv = (file: File) =>
    file.type === "text/csv" ||
    file.type === "application/vnd.ms-excel" ||
    file.name.toLowerCase().endsWith(".csv");

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && isCsv(file)) {
      onFileSelect(file);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && isCsv(file)) {
      onFileSelect(file);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <Card className="p-8">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-gray-400 transition-colors"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-full bg-blue-50 p-4">
            <Upload className="w-8 h-8 text-blue-500" />
          </div>
          <div>
            <h3 className="font-semibold text-lg mb-1">Upload Trade Data</h3>
            <p className="text-gray-500 text-sm mb-4">
              Drag and drop your CSV file here or click to browse
            </p>
          </div>
          <label htmlFor="file-upload">
            <Button disabled={isLoading} asChild>
              <span>
                <FileText className="w-4 h-4 mr-2" />
                {isLoading ? "Processing..." : "Select CSV File"}
              </span>
            </Button>
          </label>
          <input
            id="file-upload"
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
            disabled={isLoading}
          />
          <p className="text-xs text-gray-400 mt-2">
            Any CSV columns are supported; data is parsed by the backend.
          </p>
        </div>
      </div>
    </Card>
  );
}

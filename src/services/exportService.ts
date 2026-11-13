// src/services/exportService.ts

export const exportService = {
  downloadCsv: (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csvContent =
      "\uFEFF" + // UTF-8 BOM for Microsoft Excel in Pakistan / Windows
      [
        headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(","),
        ...rows.map((row) =>
          row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")
        ),
      ].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  exportToCsv: (data: Record<string, unknown>[], filename: string) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const rows = data.map((item) => headers.map((h) => String(item[h] ?? "")));
    exportService.downloadCsv(filename, headers, rows);
  },

  printReport: () => {
    window.print();
  },
};


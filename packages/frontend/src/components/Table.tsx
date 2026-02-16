/**
 * Table component - Data table with headers
 */

import { ReactNode } from 'react';
import './Table.css';

interface TableProps {
  headers: string[];
  rows: (string | ReactNode)[][];
}

export function Table({ headers, rows }: TableProps) {
  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            {headers.map((header, i) => (
              <th key={i}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

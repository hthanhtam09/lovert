import Link from 'next/link';
import { LIMITS } from '@lovert/core';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { DataConvertTool } from '@/components/DataConvertTool';
import { getTool } from '@/content/tools';
import { pageMetadata } from '@/lib/seo';

const tool = getTool('json-to-csv');
export const metadata = pageMetadata({ path: tool.path, title: tool.title, description: tool.description });

export default function Page() {
  return (
    <>
      <section className="tool-screen">
        <header className="page-head">
          <Breadcrumbs crumbs={[{ name: 'Home', path: '/' }, { name: tool.navLabel, path: tool.path }]} />
          <h1>{tool.h1}</h1>
          <p className="lede">Choose a JSON file that holds an array of objects. Each object becomes a row and each key a column, ready for Excel, Google Sheets or Numbers.</p>
        </header>
        <noscript>
          <p className="noscript">This converter needs JavaScript because the file is converted by your browser. Everything else on this page works without it.</p>
        </noscript>
        <DataConvertTool direction="json-to-csv" />
      </section>
      <div className="prose">
        <h2>How are the columns chosen?</h2>
        <p>
          Every key that appears in any object becomes a column, in the order keys first appear. When an object lacks a key, its cell is empty. For
          example <code>{`[{"name":"An"},{"name":"Bình","city":"Đà Nẵng"}]`}</code> gives the columns <code>name,city</code> and an empty city for An.
        </p>
        <h2>How are null, nested data and special characters written?</h2>
        <table>
          <tbody>
            <tr><th scope="row">null</th><td>An empty cell, the same as a missing key. The result lists how many there were.</td></tr>
            <tr><th scope="row">Objects and arrays</th><td>Written as JSON text inside the cell, e.g. <code>{`["a","b"]`}</code>.</td></tr>
            <tr><th scope="row">Numbers and true/false</th><td>Written as they appear in JSON: <code>-5</code>, <code>3.14</code>, <code>true</code>.</td></tr>
            <tr><th scope="row">Commas, quotes, line breaks</th><td>The cell is put in double quotes and inner quotes are doubled (RFC 4180). Lines end with CRLF.</td></tr>
            <tr><th scope="row">Accents (ă, ơ, đ…)</th><td>UTF-8. A byte order mark (BOM) is added by default so Excel shows them correctly; turn it off for tools that do not expect one.</td></tr>
          </tbody>
        </table>
        <h2>What about text that starts with = + - or @?</h2>
        <p>
          Spreadsheets can run such text as a formula when the CSV is opened, which is a known risk with files from untrusted sources (CSV injection). By
          default the text is written exactly as it is and the result tells you how many cells start that way. Turn on <strong>Protect against spreadsheet
          formulas</strong> to put an apostrophe in front of them, so spreadsheets show them as text. Numbers such as <code>-5</code> are never changed.
        </p>
        <h2>Limits</h2>
        <ul>
          <li>The top level must be an array of objects; each item that is not an object is reported by position.</li>
          <li>Up to {LIMITS.maxDataInputBytes / 1e6} MB, {LIMITS.maxDataRows.toLocaleString('en-US')} rows and {LIMITS.maxDataCells.toLocaleString('en-US')} cells. The preview shows the first 50 rows; the download has all of them.</li>
          <li>JavaScript lists keys that look like whole numbers (<code>&quot;1&quot;</code>, <code>&quot;2&quot;</code>) before other keys, so such columns come first.</li>
        </ul>
        <h2>Is my file uploaded?</h2>
        <p>No. The file is read and converted by your browser on your device. Need the other direction? Use <Link href="/csv-to-json">CSV to JSON</Link>.</p>
      </div>
    </>
  );
}

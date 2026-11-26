import Link from 'next/link';
import { LIMITS } from '@lovert/core';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { DataConvertTool } from '@/components/DataConvertTool';
import { getTool } from '@/content/tools';
import { pageMetadata } from '@/lib/seo';

const tool = getTool('csv-to-json');
export const metadata = pageMetadata({ path: tool.path, title: tool.title, description: tool.description });

export default function Page() {
  return (
    <>
      <section className="tool-screen">
        <header className="page-head">
          <Breadcrumbs crumbs={[{ name: 'Home', path: '/' }, { name: tool.navLabel, path: tool.path }]} />
          <h1>{tool.h1}</h1>
          <p className="lede">Choose a CSV file with a header row. Each row becomes one JSON object whose keys are the header names. Every value stays text, exactly as written.</p>
        </header>
        <noscript>
          <p className="noscript">This converter needs JavaScript because the file is converted by your browser. Everything else on this page works without it.</p>
        </noscript>
        <DataConvertTool direction="csv-to-json" />
      </section>
      <div className="prose">
        <h2>What does the JSON look like?</h2>
        <p>A CSV like this:</p>
        <pre>{`code,name,city\n007,"Nguyễn, An",Huế`}</pre>
        <p>becomes an array with one object per row:</p>
        <pre>{`[\n  {\n    "code": "007",\n    "name": "Nguyễn, An",\n    "city": "Huế"\n  }\n]`}</pre>
        <h2>Why are numbers kept as strings?</h2>
        <p>
          A CSV has no types: <code>007</code>, <code>1e5</code> and <code>0912 345 678</code> are all just text. Turning them into numbers would drop
          leading zeros from postal codes, IDs and phone numbers, or change long IDs. So every value is written as a JSON string; convert the fields you
          need in your own code.
        </p>
        <h2>What goes in and what comes out?</h2>
        <table>
          <tbody>
            <tr><th scope="row">Input</th><td>A UTF-8 CSV (with or without BOM), comma-separated, first row is the header. Up to {LIMITS.maxDataInputBytes / 1e6} MB and {LIMITS.maxDataRows.toLocaleString('en-US')} rows.</td></tr>
            <tr><th scope="row">Quoting</th><td>Fields in double quotes may contain commas, line breaks and quotes written twice (<code>&quot;&quot;</code>), as in RFC 4180. CRLF and LF line ends both work.</td></tr>
            <tr><th scope="row">Output</th><td>A JSON array of objects, pretty-printed, UTF-8. It is parsed back and compared value by value before you can download it.</td></tr>
            <tr><th scope="row">Preview</th><td>The first 50 rows and the start of the JSON. The download always has every row.</td></tr>
          </tbody>
        </table>
        <h2>Which errors are reported?</h2>
        <ul>
          <li>An empty or duplicate header name (keys must be unique), with the column numbers.</li>
          <li>Rows with more or fewer values than the header, with their line numbers. Usually a comma inside a value that is not quoted.</li>
          <li>A quote in the middle of an unquoted field, or a quoted field that is never closed.</li>
          <li>A file that is not UTF-8. In Excel, save as “CSV UTF-8 (Comma delimited)”. Semicolon-separated files are not supported yet.</li>
        </ul>
        <h2>Is my file uploaded?</h2>
        <p>No. The file is read and converted by your browser on your device. Need the other direction? Use <Link href="/json-to-csv">JSON to CSV</Link>.</p>
      </div>
    </>
  );
}

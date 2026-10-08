import { readFileSync as readRawSync } from 'node:fs';
import { readFile as readRaw } from 'node:fs/promises';
import ts from 'typescript';

function source(path, text) {
  if (!/\.tsx?$/.test(String(path))) return text;
  return ts.transpileModule(text, {
    fileName: String(path),
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
      verbatimModuleSyntax: true,
    },
  }).outputText;
}

// Keep existing dependency stubs and data-URL loaders; erase only TS syntax.
export async function readFile(path, encoding = 'utf8') {
  return source(path, await readRaw(path, encoding));
}
export function readFileSync(path, encoding = 'utf8') {
  return source(path, readRawSync(path, encoding));
}

// Copia a public/tfjs los binarios WebAssembly de TensorFlow.js, que la aplicación carga en ejecución.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const origen = join(raiz, 'node_modules/@tensorflow/tfjs-backend-wasm/dist');
const destino = join(raiz, 'public/tfjs');
mkdirSync(destino, { recursive: true });
const archivos = readdirSync(origen).filter((f) => f.endsWith('.wasm'));
for (const f of archivos) copyFileSync(join(origen, f), join(destino, f));
console.log(`TensorFlow.js: ${archivos.length} binarios WebAssembly copiados a public/tfjs`);

/**
 * Extractor de rasgos de las fotografías: MobileNet v1 (0,50 · 224 px) en TensorFlow.js, incluido
 * en la aplicación, sin conexión. Se usa la red sin su capa de clasificación: de cada fotografía
 * sale un vector de 512 rasgos que alimenta el motor de conocimiento.
 * Se intenta primero WebAssembly (mismo resultado en todos los teléfonos), luego WebGL y por
 * último JavaScript puro. Si ninguno funciona, la aplicación sigue trabajando sin aprendizaje.
 */
import { DIM_VECTOR, normalizar } from '../domain/conocimiento';
import { cargarImagen, lienzo } from './imagen';

export interface EstadoVision {
  fase: 'sin-cargar' | 'cargando' | 'listo' | 'no-disponible';
  motor?: string;
  error?: string;
}

let estado: EstadoVision = { fase: 'sin-cargar' };
let promesa: Promise<((c: HTMLCanvasElement) => Promise<Float32Array>) | null> | null = null;

export function estadoVision(): EstadoVision {
  return estado;
}

async function cargar(): Promise<((c: HTMLCanvasElement) => Promise<Float32Array>) | null> {
  estado = { fase: 'cargando' };
  try {
    const tf = await import('@tensorflow/tfjs-core');
    const capas = await import('@tensorflow/tfjs-layers');
    let motor = '';
    for (const nombre of ['wasm', 'webgl', 'cpu']) {
      try {
        if (nombre === 'wasm') {
          const wasm = await import('@tensorflow/tfjs-backend-wasm');
          wasm.setWasmPaths(new URL('./tfjs/', document.baseURI).href);
        } else if (nombre === 'webgl') await import('@tensorflow/tfjs-backend-webgl');
        else await import('@tensorflow/tfjs-backend-cpu');
        if (await tf.setBackend(nombre)) {
          await tf.ready();
          motor = nombre;
          break;
        }
      } catch {
        // se intenta el siguiente motor
      }
    }
    if (!motor) throw new Error('Ningún motor de cálculo está disponible en este dispositivo.');
    const base = await capas.loadLayersModel(new URL('./modelo/model.json', document.baseURI).href);
    // Hasta la última capa convolucional; lo que sigue es el clasificador de ImageNet, que no se usa
    const red = capas.model({ inputs: base.inputs, outputs: base.getLayer('conv_pw_13_relu').output as never });
    const incrustar = async (c: HTMLCanvasElement) => {
      const t = tf.tidy(() => {
        const x = tf.expandDims(tf.sub(tf.div(tf.cast(tf.browser.fromPixels(c), 'float32'), 127.5), 1), 0);
        return tf.reshape(tf.mean(red.predict(x) as never, [1, 2]), [-1]);
      });
      const v = (await t.data()) as Float32Array;
      t.dispose();
      if (v.length !== DIM_VECTOR) throw new Error('El modelo de visión entregó un vector inesperado.');
      return normalizar(v);
    };
    // Comprobación con una imagen neutra: detecta fallos del motor antes de usarlo con fotos
    const prueba = lienzo(224, 224);
    prueba.getContext('2d')!.fillRect(0, 0, 224, 224);
    const v = await incrustar(prueba);
    if (!v.every((x) => Number.isFinite(x))) throw new Error('El modelo de visión entregó valores no válidos.');
    estado = { fase: 'listo', motor };
    return incrustar;
  } catch (e) {
    estado = { fase: 'no-disponible', error: String((e as { message?: string })?.message ?? e) };
    return null;
  }
}

/** Carga el modelo (una sola vez). Devuelve false si el dispositivo no puede ejecutarlo. */
export async function prepararVision(): Promise<boolean> {
  if (!promesa) promesa = cargar();
  return (await promesa) != null;
}

/** Vector de rasgos de una fotografía, o null si el modelo de visión no está disponible. */
export async function incrustarFoto(foto: Blob): Promise<Float32Array | null> {
  if (!promesa) promesa = cargar();
  const incrustar = await promesa;
  if (!incrustar) return null;
  const img = await cargarImagen(foto);
  // La fotografía completa se lleva a 224 × 224 (sin recortar: el daño puede estar en cualquier parte)
  const c = lienzo(224, 224);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, 224, 224);
  return incrustar(c);
}

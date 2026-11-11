import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import vm from 'node:vm'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function makeStorage() {
  const map = new Map()
  return {
    get length() { return map.size },
    getItem: k => (map.has(String(k)) ? map.get(String(k)) : null),
    setItem: (k, v) => { map.set(String(k), String(v)) },
    removeItem: k => { map.delete(String(k)) },
    clear: () => map.clear(),
    key: i => Array.from(map.keys())[i] ?? null
  }
}

export function createEnv() {
  const context = vm.createContext({
    console,
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    crypto: globalThis.crypto,
    btoa: globalThis.btoa,
    atob: globalThis.atob,
    TextEncoder,
    TextDecoder,
    Date,
    Math,
    JSON,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: async () => { throw new Error('fetch not available in test env') },
    navigator: { userAgent: 'node-test' },
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, appendChild() {}, remove() {} }),
      addEventListener() {},
      body: { classList: { toggle() {} } }
    }
  })

  vm.runInContext('globalThis.window = globalThis', context)

  const load = (rel) => {
    const src = readFileSync(resolve(ROOT, rel), 'utf8')
    vm.runInContext(src, context, { filename: rel })
  }

  load('supabase.js')
  load('store.js')
  load('auth.js')

  const evaluate = expr => vm.runInContext(expr, context)

  return { context, evaluate, Store: evaluate('Store'), load }
}

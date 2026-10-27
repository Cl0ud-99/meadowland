// ---------------------------------------------------------------------------
// 状态记忆（localStorage）
//
// 保存：时间、季节、建筑风格、田地作物、树品种、静音
//
// 所有操作都有 try/catch，任何异常都降级为"不保存"，绝不阻断主流程。
// ---------------------------------------------------------------------------

const KEY = 'meadowland-v1';
const VERSION = 1;

// 探测 localStorage 是否可用（隐私模式下会抛异常）
let available = false;
try {
  const k = '__ml_test__';
  window.localStorage.setItem(k, '1');
  window.localStorage.removeItem(k);
  available = true;
} catch (e) {
  available = false;
}

export const STORAGE_OK = available;

export function loadState() {
  if (!available) return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== VERSION) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function saveState(payload) {
  if (!available) return false;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...payload }));
    return true;
  } catch (e) {
    return false;
  }
}

export function clearState() {
  if (!available) return;
  try { window.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}


// ---------------------------------------------------------------------------
// 自定义鼠标指针
//
// 用内联 SVG data-URI 做 cursor，不依赖外部文件。
//   default  —— 圆润的小爪印（配合农场的治愈感）
//   grab     —— 张开的小手（可拖动）
//   grabbing —— 握住的小手（拖动中）
//   pointer  —— 小灯泡/箭头，表示可交互
//
// 注意：SVG 里的 # 要转义成 %23，否则 data-URI 会截断。
// ---------------------------------------------------------------------------

const svgUrl = (svg) => 'url("data:image/svg+xml,' + encodeURIComponent(svg).replace(/'/g, '%27') + '")';

// 默认：一颗小小的爪印
const CURSOR_DEFAULT = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <g fill="none" stroke="#2b2118" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="16" cy="20" rx="6.2" ry="5.2" fill="#fff8ec"/>
    <circle cx="8.6" cy="11.6" r="2.5" fill="#fff8ec"/>
    <circle cx="14" cy="8.4" r="2.5" fill="#fff8ec"/>
    <circle cx="20" cy="8.8" r="2.5" fill="#fff8ec"/>
    <circle cx="24.6" cy="12.6" r="2.2" fill="#fff8ec"/>
  </g>
</svg>`);

// 可拖动：张开的小手
const CURSOR_GRAB = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <g fill="#fff8ec" stroke="#2b2118" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M11 17V9.5a2 2 0 0 1 4 0V15"/>
    <path d="M15 15V7.5a2 2 0 0 1 4 0V15"/>
    <path d="M19 15V9.5a2 2 0 0 1 4 0V18"/>
    <path d="M23 14.5a2 2 0 0 1 4 0V20c0 4.4-3.6 8-8 8h-2c-3 0-5.2-1.4-7-4l-3.2-4.6a2 2 0 0 1 3.2-2.4L11 19"/>
  </g>
</svg>`);

// 拖动中：握拳
const CURSOR_GRABBING = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <g fill="#fff8ec" stroke="#2b2118" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M11 16V10a2 2 0 0 1 4 0v4"/>
    <path d="M15 14V9a2 2 0 0 1 4 0v5"/>
    <path d="M19 14V11a2 2 0 0 1 4 0v7"/>
    <path d="M23 15.5a2 2 0 0 1 4 0V20c0 4.4-3.6 8-8 8h-2c-3 0-5.2-1.4-7-4l-3.2-4.6a2 2 0 0 1 3.2-2.4L11 18"/>
  </g>
</svg>`);

// 可交互：带小星星的箭头（一眼看出"这里能点"）
const CURSOR_POINTER = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <g stroke="#2b2118" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 6l7.5 19 3.2-7.3 7.3-3.2z" fill="#fff8ec"/>
    <path d="M22 5l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" fill="#ffd66e"/>
    <path d="M27 13l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" fill="#ffd66e"/>
  </g>
</svg>`);

// 应用到 DOM：通过 CSS 变量注入，样式表里用 var() 引用
export function installCursors() {
  const root = document.documentElement;
  root.style.setProperty('--cursor-default', CURSOR_DEFAULT);
  root.style.setProperty('--cursor-grab', CURSOR_GRAB);
  root.style.setProperty('--cursor-grabbing', CURSOR_GRABBING);
  root.style.setProperty('--cursor-pointer', CURSOR_POINTER);
}
